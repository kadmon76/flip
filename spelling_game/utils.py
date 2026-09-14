# spelling_game/utils.py
from django.utils import timezone
from .models import WordAttempt, LetterAttempt, GameSession, UserProgress
import json

def start_word_attempt(user, word, session=None):
    """
    Start tracking a new word attempt
    
    Args:
        user: Django User object
        word: Word object
        session: GameSession object (optional)
    
    Returns:
        WordAttempt object
    """
    if not session:
        # Get the user's active session or create one
        session = GameSession.objects.filter(
            user=user,
            end_time__isnull=True
        ).first()
        
        if not session:
            session = GameSession(user=user)
            session.save()
    
    word_attempt = WordAttempt(
        user=user,
        word=word,
        session=session
    )
    word_attempt.save()
    return word_attempt

def log_letter_placement(word_attempt, letter_position, expected_letter, placed_letter, attempt_number, time_taken=None):
    """
    Log a letter placement attempt
    
    Args:
        word_attempt: WordAttempt object
        letter_position: int (0-indexed position in the word)
        expected_letter: str (single character)
        placed_letter: str (single character)
        attempt_number: int (which attempt within the word)
        time_taken: float (seconds it took to place this letter)
    
    Returns:
        LetterAttempt object
    """
    is_correct = expected_letter.lower() == placed_letter.lower()
    
    letter_attempt = LetterAttempt(
        word_attempt=word_attempt,
        letter_position=letter_position,
        expected_letter=expected_letter,
        placed_letter=placed_letter,
        is_correct=is_correct,
        attempt_number=attempt_number,
        time_taken=time_taken
    )
    letter_attempt.save()
    return letter_attempt

def complete_word_attempt(word_attempt, is_successful):
    """
    Mark a word attempt as complete
    
    Args:
        word_attempt: WordAttempt object
        is_successful: bool (whether the word was correctly spelled)
    """
    word_attempt.completion_time = timezone.now()
    word_attempt.is_successful = is_successful
    word_attempt.save()

def end_game_session(session):
    """
    Mark a game session as ended
    
    Args:
        session: GameSession object
    """
    session.end_time = timezone.now()
    session.save()
    
    # Update user progress
    _update_user_progress(session.user)

def _update_user_progress(user):
    """
    Update the UserProgress record for today
    
    Args:
        user: Django User object
    """
    today = timezone.now().date()
    
    # Get or create today's progress record
    progress, created = UserProgress.objects.get_or_create(
        user=user,
        date=today
    )
    
    # Get today's word attempts
    todays_attempts = WordAttempt.objects.filter(
        user=user,
        start_time__date=today
    )
    
    words_attempted = todays_attempts.count()
    words_completed = todays_attempts.filter(is_successful=True).count()
    
    if words_attempted > 0:
        # Calculate average attempts
        total_attempts = sum(attempt.attempts_count for attempt in todays_attempts)
        avg_attempts = total_attempts / words_attempted
        
        # Calculate average time
        completed_attempts = todays_attempts.filter(completion_time__isnull=False)
        if completed_attempts:
            total_time = sum(
                (attempt.completion_time - attempt.start_time).total_seconds() 
                for attempt in completed_attempts
            )
            avg_time = total_time / completed_attempts.count()
        else:
            avg_time = 0
    else:
        avg_attempts = 0
        avg_time = 0
    
    # Update the progress record
    progress.words_attempted = words_attempted
    progress.words_completed = words_completed
    progress.average_attempts_per_word = avg_attempts
    progress.average_time_per_word = avg_time
    progress.save()