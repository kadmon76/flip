# spelling_game/views.py
from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
import json
import logging
import random
import time
from datetime import datetime

from .models import Word, GameSession, WordAttempt, LetterAttempt, UserProgress
from .utils import start_word_attempt, log_letter_placement, complete_word_attempt, end_game_session

# Setup logger for game and debug logging
logger = logging.getLogger(__name__)
debug_logger = logging.getLogger('spelling_game.debug')

# Get debug mode setting
DEBUG_ENABLED = getattr(settings, 'SPELLING_GAME_DEBUG', False)

def is_debug_allowed(request):
    """Check if debugging is allowed for this user"""
    # In production, only allow staff users to use debug
    if not settings.DEBUG:
        return request.user.is_authenticated and request.user.is_staff
    
    # In development, allow dev_test_user and staff
    return (
        request.user.is_authenticated and 
        (request.user.username == 'dev_test_user' or request.user.is_staff)
    )

@login_required
def index(request):
    """Main game view"""
    context = {}
    
    # Add debug context if enabled and allowed
    if DEBUG_ENABLED and is_debug_allowed(request):
        context['debug_enabled'] = True
        context['debug_user'] = request.user.username
    
    return render(request, 'spelling_game/index.html', context)

@login_required
def assessment(request):
    """Initial assessment view"""
    # Check if user already has assessment data
    has_assessment = GameSession.objects.filter(
        user=request.user,
        is_assessment=True
    ).exists()
    
    if has_assessment:
        # User already took assessment, redirect to main game
        return redirect('spelling_game:index')
    
    # Create assessment session
    session = GameSession(
        user=request.user,
        is_assessment=True,
        device_type=request.META.get('HTTP_USER_AGENT', '')[:50],
        browser_info=request.META.get('HTTP_USER_AGENT', '')[:255]
    )
    session.save()
    
    # Get assessment words (select a mix of difficulty levels)
    assessment_words = []
    for difficulty in range(1, 4):  # Easy, medium, hard
        words = Word.objects.filter(difficulty=difficulty)[:5]
        assessment_words.extend(words)
    
    # Shuffle the words
    random.shuffle(assessment_words)
    
    # Convert to list of dicts for JavaScript
    words_data = [
        {
            'id': word.id,
            'text': word.text,
            'image_path': word.image_path,
            'category': word.category
        }
        for word in assessment_words[:10]  # Limit to 10 words
    ]
    
    context = {
        'assessment': True,
        'session_id': session.id,
        'words': json.dumps(words_data)
    }
    
    # Add debug context if enabled and allowed
    if DEBUG_ENABLED and is_debug_allowed(request):
        context['debug_enabled'] = True
        context['debug_user'] = request.user.username
    
    return render(request, 'spelling_game/assessment.html', context)

@csrf_exempt
@login_required
def log_data(request):
    """API endpoint to log gameplay data"""
    start_time = time.time()  # For performance tracking
    
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST requests allowed'})
    
    try:
        data = json.loads(request.body)
        action = data.get('action')
        
        # Debug logging if enabled
        if DEBUG_ENABLED and is_debug_allowed(request):
            debug_logger.debug(f"Game action: {action} - Data: {data}")
        
        if action == 'start_word':
            # Start a new word attempt
            word_id = data.get('word_id')
            session_id = data.get('session_id')
            
            word = Word.objects.get(id=word_id)
            session = GameSession.objects.get(id=session_id)
            
            word_attempt = start_word_attempt(request.user, word, session)
            
            response_data = {
                'status': 'success',
                'word_attempt_id': word_attempt.id
            }
            
            # Add debug info if enabled
            if DEBUG_ENABLED and is_debug_allowed(request):
                response_data['debug'] = {
                    'word_text': word.text,
                    'word_difficulty': word.difficulty,
                    'session_start_time': session.start_time.isoformat(),
                    'processing_time_ms': (time.time() - start_time) * 1000
                }
            
            return JsonResponse(response_data)
            
        elif action == 'log_letter':
            # Log a letter placement
            word_attempt_id = data.get('word_attempt_id')
            letter_position = data.get('position')
            expected_letter = data.get('expected')
            placed_letter = data.get('placed')
            attempt_number = data.get('attempt_number')
            time_taken = data.get('time_taken')
            
            word_attempt = WordAttempt.objects.get(id=word_attempt_id)
            
            letter_attempt = log_letter_placement(
                word_attempt,
                letter_position,
                expected_letter,
                placed_letter,
                attempt_number,
                time_taken
            )
            
            # Update attempts count
            if attempt_number > word_attempt.attempts_count:
                word_attempt.attempts_count = attempt_number
                word_attempt.save()
            
            response_data = {
                'status': 'success',
                'is_correct': letter_attempt.is_correct
            }
            
            # Add debug info if enabled
            if DEBUG_ENABLED and is_debug_allowed(request):
                response_data['debug'] = {
                    'letter_attempt_id': letter_attempt.id,
                    'word_text': word_attempt.word.text,
                    'position': letter_position,
                    'expected': expected_letter,
                    'placed': placed_letter,
                    'processing_time_ms': (time.time() - start_time) * 1000
                }
            
            return JsonResponse(response_data)
            
        elif action == 'complete_word':
            # Mark a word attempt as complete
            word_attempt_id = data.get('word_attempt_id')
            is_successful = data.get('is_successful')
            lives_remaining = data.get('lives_remaining', 0)
            
            word_attempt = WordAttempt.objects.get(id=word_attempt_id)
            word_attempt.lives_remaining = lives_remaining
            
            complete_word_attempt(word_attempt, is_successful)
            
            response_data = {'status': 'success'}
            
            # Add debug info if enabled
            if DEBUG_ENABLED and is_debug_allowed(request):
                response_data['debug'] = {
                    'word_text': word_attempt.word.text,
                    'is_successful': is_successful,
                    'attempts_count': word_attempt.attempts_count,
                    'total_time_ms': word_attempt.time_taken,
                    'processing_time_ms': (time.time() - start_time) * 1000
                }
            
            return JsonResponse(response_data)
            
        elif action == 'end_session':
            # End the game session
            session_id = data.get('session_id')
            session = GameSession.objects.get(id=session_id)
            
            end_game_session(session)
            
            response_data = {'status': 'success'}
            
            # Add debug info if enabled
            if DEBUG_ENABLED and is_debug_allowed(request):
                # Calculate session stats
                word_attempts = WordAttempt.objects.filter(session=session)
                successful_attempts = word_attempts.filter(is_successful=True).count()
                
                response_data['debug'] = {
                    'session_duration_seconds': (session.end_time - session.start_time).total_seconds(),
                    'words_attempted': word_attempts.count(),
                    'words_successful': successful_attempts,
                    'success_rate': successful_attempts / word_attempts.count() if word_attempts.count() > 0 else 0,
                    'processing_time_ms': (time.time() - start_time) * 1000
                }
            
            return JsonResponse(response_data)
            
        else:
            return JsonResponse({'status': 'error', 'message': 'Unknown action'})
            
    except Exception as e:
        logger.error(f"Error in log_data: {str(e)}")
        
        # Log more details in debug mode
        if DEBUG_ENABLED:
            debug_logger.exception("Detailed error in log_data")
        
        return JsonResponse({'status': 'error', 'message': str(e)})


@csrf_exempt
@login_required
def log_tracking_data(request):
    """API endpoint for the debug data collection module"""
    if not DEBUG_ENABLED:
        return JsonResponse({'status': 'error', 'message': 'Debug mode disabled'}, status=403)
    
    if not is_debug_allowed(request):
        return JsonResponse({'status': 'error', 'message': 'Debug access denied'}, status=403)
    
    if request.method != 'POST':
        return JsonResponse({'status': 'error', 'message': 'Only POST requests allowed'})
    
    try:
        data = json.loads(request.body)
        session_id = data.get('sessionId')
        events = data.get('events', [])
        
        # Log batch of events
        debug_logger.info(f"Received {len(events)} tracking events from session {session_id}")
        
        # Process events if needed (store in database, etc.)
        processed_count = 0
        for event in events:
            event_type = event.get('eventType')
            event_data = event.get('eventData', {})
            
            # Handle different event types
            if event_type == 'wordAttempt':
                # Could store in database or just log
                debug_logger.debug(f"Word attempt: {event_data.get('word')} - Success: {event_data.get('success')}")
                processed_count += 1
                
            elif event_type == 'letterAttempt':
                # Could store in database or just log
                debug_logger.debug(f"Letter attempt: {event_data.get('correctLetter')} -> {event_data.get('attemptedLetter')}")
                processed_count += 1
                
            elif event_type == 'sessionStart':
                debug_logger.info(f"Session started: {event_data.get('sessionId')}")
                processed_count += 1
                
            elif event_type == 'sessionEnd':
                debug_logger.info(f"Session ended: {event_data.get('sessionId')} - Duration: {event_data.get('duration')}ms")
                processed_count += 1
                
            # Add more event types as needed
        
        return JsonResponse({
            'status': 'success',
            'processed': processed_count,
            'serverTime': timezone.now().isoformat()
        })
        
    except Exception as e:
        debug_logger.error(f"Error processing tracking data: {str(e)}")
        return JsonResponse({'status': 'error', 'message': str(e)})


def get_words(request):
    """API endpoint to get words for the game"""
    if not request.user.is_authenticated:
        return JsonResponse({'status': 'error', 'message': 'Authentication required'}, status=401)
    
    try:
        # Get parameters
        difficulty = request.GET.get('difficulty', '1')
        category = request.GET.get('category', '')
        limit = int(request.GET.get('limit', '10'))
        
        # Query words
        query = Word.objects.filter(difficulty=difficulty)
        if category:
            query = query.filter(category=category)
        
        # Limit and randomize
        words = list(query.all())
        random.shuffle(words)
        words = words[:limit]
        
        # Format response
        words_data = [
            {
                'id': word.id,
                'text': word.text,
                'image_path': word.image_path,
                'category': word.category,
                'difficulty': word.difficulty
            }
            for word in words
        ]
        
        response_data = {
            'status': 'success',
            'words': words_data
        }
        
        # Add debug info if enabled
        if DEBUG_ENABLED and is_debug_allowed(request):
            response_data['debug'] = {
                'total_words_available': query.count(),
                'difficulty_filter': difficulty,
                'category_filter': category,
                'limit_applied': limit
            }
        
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.error(f"Error in get_words: {str(e)}")
        return JsonResponse({'status': 'error', 'message': str(e)})