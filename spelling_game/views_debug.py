# spelling_game/views_debug.py
import json
import logging
from datetime import datetime

from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_POST, require_GET
from django.conf import settings

# views_debug.py - Debug endpoints for the spelling game

import json
import logging
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, get_object_or_404

from .models import Word, GameSession, WordAttempt, LetterAttempt

# Set up logging
logger = logging.getLogger(__name__)

@ensure_csrf_cookie
def debug_panel(request):
    """
    Render the debug panel template.
    """
    return render(request, 'spelling_game/debug_panel.html')

@require_http_methods(["POST"])
def save_session_data(request):
    """
    Save game session data sent from the client.
    """
    try:
        # Parse the JSON data
        data = json.loads(request.body)
        
        # Extract session info
        session_id = data.get('session_id')
        start_time = data.get('start_time')
        end_time = data.get('end_time')
        theme = data.get('theme', 'unknown')
        
        # Parse datetime strings
        start_time_obj = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
        end_time_obj = datetime.fromisoformat(end_time.replace('Z', '+00:00')) if end_time else None
        
        # Create or update session
        session, created = GameSession.objects.update_or_create(
            session_id=session_id,
            defaults={
                'user': request.user if request.user.is_authenticated else None,
                'start_time': start_time_obj,
                'end_time': end_time_obj,
                'theme': theme,
                'raw_data': json.dumps(data)  # Store full data for future analysis
            }
        )
        
        # Process word attempts
        if 'attempts' in data:
            process_word_attempts(session, data['attempts'])
        
        return JsonResponse({
            'status': 'success',
            'message': 'Session data saved successfully',
            'session_id': session.session_id
        })
        
    except json.JSONDecodeError:
        logger.error("Invalid JSON in request body")
        return JsonResponse({
            'status': 'error', 
            'message': 'Invalid JSON format'
        }, status=400)
        
    except Exception as e:
        logger.exception("Error saving session data")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

def process_word_attempts(session, attempts):
    """
    Process word attempts data and save to database.
    """
    for attempt_data in attempts:
        # Extract attempt info
        word_text = attempt_data.get('word')
        user_attempt = attempt_data.get('userAttempt')
        is_correct = attempt_data.get('isCorrect', False)
        difficulty = attempt_data.get('difficulty', 'unknown')
        time_taken = attempt_data.get('timeTaken')
        timestamp = attempt_data.get('timestamp')
        
        # Parse timestamp
        if timestamp:
            timestamp_obj = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
        else:
            timestamp_obj = datetime.now()
        
        # Get or create word
        word, _ = Word.objects.get_or_create(
            text=word_text,
            defaults={'difficulty': difficulty}
        )
        
        # Create word attempt
        word_attempt = WordAttempt.objects.create(
            session=session,
            word=word,
            user_attempt=user_attempt,
            is_correct=is_correct,
            time_taken=time_taken,
            timestamp=timestamp_obj
        )
        
        # Process letter analysis if available
        letter_analysis = attempt_data.get('letterAnalysis')
        if letter_analysis:
            process_letter_analysis(word_attempt, letter_analysis)

def process_letter_analysis(word_attempt, analysis):
    """
    Process letter analysis data and save to database.
    """
    # Process incorrect letters (confusions)
    if 'incorrectLetters' in analysis:
        for letter_data in analysis['incorrectLetters']:
            expected = letter_data.get('expected')
            actual = letter_data.get('actual')
            position = letter_data.get('position', 0)
            
            LetterAttempt.objects.create(
                word_attempt=word_attempt,
                expected_letter=expected,
                actual_letter=actual,
                position=position,
                is_correct=False
            )
    
    # Process correct letters
    if 'correctLetters' in analysis:
        for letter_data in analysis['correctLetters']:
            letter = letter_data.get('letter')
            position = letter_data.get('position', 0)
            
            LetterAttempt.objects.create(
                word_attempt=word_attempt,
                expected_letter=letter,
                actual_letter=letter,
                position=position,
                is_correct=True
            )

@login_required
def get_session_data(request, session_id=None):
    """
    Retrieve session data for analysis.
    If session_id is provided, return that specific session,
    otherwise return recent sessions.
    """
    try:
        if session_id:
            # Get specific session
            session = get_object_or_404(GameSession, session_id=session_id)
            return JsonResponse(format_session_data(session))
        else:
            # Get recent sessions (limit to 10)
            recent_sessions = GameSession.objects.order_by('-start_time')[:10]
            sessions_data = [format_session_data(session) for session in recent_sessions]
            return JsonResponse({'sessions': sessions_data})
            
    except Exception as e:
        logger.exception("Error retrieving session data")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

def format_session_data(session):
    """
    Format session data for API response.
    """
    # Get word attempts for this session
    word_attempts = WordAttempt.objects.filter(session=session)
    
    # Calculate statistics
    total_attempts = word_attempts.count()
    correct_attempts = word_attempts.filter(is_correct=True).count()
    success_rate = (correct_attempts / total_attempts * 100) if total_attempts > 0 else 0
    
    # Format duration
    duration = None
    if session.end_time and session.start_time:
        duration = (session.end_time - session.start_time).total_seconds()
    
    # Format attempts
    attempts_data = []
    for attempt in word_attempts:
        letter_attempts = LetterAttempt.objects.filter(word_attempt=attempt)
        
        # Analyze letter correctness
        letter_analysis = {
            'correctLetters': [],
            'incorrectLetters': [],
            'confusions': []
        }
        
        for letter in letter_attempts:
            if letter.is_correct:
                letter_analysis['correctLetters'].append({
                    'letter': letter.expected_letter,
                    'position': letter.position
                })
            else:
                letter_analysis['incorrectLetters'].append({
                    'expected': letter.expected_letter,
                    'actual': letter.actual_letter,
                    'position': letter.position
                })
                
                if letter.actual_letter:  # Only add confusion if actual letter exists
                    letter_analysis['confusions'].append({
                        'expected': letter.expected_letter,
                        'actual': letter.actual_letter,
                        'position': letter.position
                    })
        
        attempts_data.append({
            'word': attempt.word.text,
            'userAttempt': attempt.user_attempt,
            'isCorrect': attempt.is_correct,
            'difficulty': attempt.word.difficulty,
            'timeTaken': attempt.time_taken,
            'timestamp': attempt.timestamp.isoformat(),
            'letterAnalysis': letter_analysis
        })
    
    return {
        'session': {
            'id': session.session_id,
            'startTime': session.start_time.isoformat(),
            'endTime': session.end_time.isoformat() if session.end_time else None,
            'theme': session.theme,
            'duration': duration
        },
        'stats': {
            'totalAttempts': total_attempts,
            'correctAttempts': correct_attempts,
            'successRate': success_rate,
            'uniqueWords': word_attempts.values('word').distinct().count()
        },
        'attempts': attempts_data
    }

@login_required
def get_letter_confusion_data(request):
    """
    Generate letter confusion data across all sessions.
    """
    try:
        # Get letter attempts with incorrect placements
        incorrect_letters = LetterAttempt.objects.filter(is_correct=False).exclude(actual_letter=None)
        
        # Aggregate confusion data
        confusion_data = {}
        
        for letter in incorrect_letters:
            key = f"{letter.expected_letter}->{letter.actual_letter}"
            
            if key not in confusion_data:
                confusion_data[key] = {
                    'expected': letter.expected_letter,
                    'actual': letter.actual_letter,
                    'count': 0,
                    'positions': {}
                }
            
            confusion_data[key]['count'] += 1
            
            # Track position-specific confusions
            pos_key = f"pos_{letter.position}"
            if pos_key not in confusion_data[key]['positions']:
                confusion_data[key]['positions'][pos_key] = 0
            confusion_data[key]['positions'][pos_key] += 1
        
        # Sort by count (highest first)
        sorted_confusions = sorted(
            confusion_data.values(), 
            key=lambda x: x['count'], 
            reverse=True
        )
        
        return JsonResponse({
            'confusions': sorted_confusions
        })
        
    except Exception as e:
        logger.exception("Error retrieving letter confusion data")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def get_word_difficulty_stats(request):
    """
    Generate statistics about word difficulty levels.
    """
    try:
        # Get all word attempts
        word_attempts = WordAttempt.objects.all()
        
        # Group by difficulty
        difficulty_stats = {}
        
        for attempt in word_attempts:
            difficulty = attempt.word.difficulty
            
            if difficulty not in difficulty_stats:
                difficulty_stats[difficulty] = {
                    'total': 0,
                    'correct': 0,
                    'successRate': 0,
                    'avgTime': 0,
                    'totalTime': 0
                }
            
            stats = difficulty_stats[difficulty]
            stats['total'] += 1
            
            if attempt.is_correct:
                stats['correct'] += 1
            
            if attempt.time_taken:
                stats['totalTime'] += attempt.time_taken
        
        # Calculate rates and averages
        for difficulty, stats in difficulty_stats.items():
            if stats['total'] > 0:
                stats['successRate'] = (stats['correct'] / stats['total']) * 100
                stats['avgTime'] = stats['totalTime'] / stats['total']
        
        return JsonResponse({
            'difficultyStats': difficulty_stats
        })
        
    except Exception as e:
        logger.exception("Error retrieving word difficulty stats")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)