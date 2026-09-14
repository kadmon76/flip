# spelling_game/models.py
from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class Word(models.Model):
    """
    Represents a word in the spelling game.
    """
    text = models.CharField(max_length=100, unique=True)
    difficulty = models.CharField(max_length=20, choices=[
        ('easy', 'Easy'),
        ('medium', 'Medium'),
        ('hard', 'Hard')
    ], default='medium')
    
    # Optional fields for more word metadata
    phonetic_spelling = models.CharField(max_length=200, blank=True, null=True)
    definition = models.TextField(blank=True, null=True)
    example_sentence = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.text} ({self.difficulty})"

class GameSession(models.Model):
    """
    Represents a user's game session.
    """
    session_id = models.CharField(max_length=100, unique=True)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)
    theme = models.CharField(max_length=50, default='general')
    
    # Store the complete raw data for future analysis
    raw_data = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"Session {self.session_id} ({self.start_time})"
    
    @property
    def duration(self):
        if self.end_time and self.start_time:
            return (self.end_time - self.start_time).total_seconds()
        return None
    
    @property
    def is_completed(self):
        return self.end_time is not None

class WordAttempt(models.Model):
    """
    Represents a user's attempt to spell a word.
    """
    session = models.ForeignKey(GameSession, on_delete=models.CASCADE, related_name='word_attempts')
    word = models.ForeignKey(Word, on_delete=models.CASCADE, related_name='attempts')
    user_attempt = models.CharField(max_length=100)
    is_correct = models.BooleanField(default=False)
    time_taken = models.FloatField(null=True, blank=True)  # Time in seconds
    timestamp = models.DateTimeField()
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.word.text} - {'Correct' if self.is_correct else 'Incorrect'}"
    
    class Meta:
        ordering = ['-timestamp']

class LetterAttempt(models.Model):
    """
    Represents each letter in a word attempt, tracking correctness.
    """
    word_attempt = models.ForeignKey(WordAttempt, on_delete=models.CASCADE, related_name='letter_attempts')
    expected_letter = models.CharField(max_length=1, null=True, blank=True)  # The correct letter
    actual_letter = models.CharField(max_length=1, null=True, blank=True)    # The user's letter
    position = models.IntegerField()  # Position in the word (0-indexed)
    is_correct = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        if self.is_correct:
            return f"Correct: {self.expected_letter} at position {self.position}"
        return f"Incorrect: {self.expected_letter} → {self.actual_letter or 'missing'} at position {self.position}"
    
    class Meta:
        ordering = ['word_attempt', 'position']

class UserProgress(models.Model):
    """Model to track user progress over time"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField(default=timezone.now)
    words_attempted = models.IntegerField(default=0)
    words_completed = models.IntegerField(default=0)
    average_attempts_per_word = models.FloatField(default=0)
    average_time_per_word = models.FloatField(default=0)  # in seconds
    
    class Meta:
        unique_together = ('user', 'date')
    
    def __str__(self):
        return f"{self.user.username}'s progress on {self.date}"