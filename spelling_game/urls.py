# spelling_game/urls.py
from django.urls import path
from . import views, views_debug

app_name = 'spelling_game'

urlpatterns = [
    path('', views.index, name='index'),
    path('assessment/', views.assessment, name='assessment'),
    path('api/log/', views.log_data, name='log_data'),
    
    # Debug endpoints
    path('debug/', views_debug.debug_panel, name='debug_panel'),
    path('debug/save-session/', views_debug.save_session_data, name='save_session_data'),
    path('debug/get-session/<str:session_id>/', views_debug.get_session_data, name='get_session_data'),
    path('debug/sessions/', views_debug.get_session_data, name='get_recent_sessions'),
    path('debug/letter-confusions/', views_debug.get_letter_confusion_data, name='get_letter_confusion_data'),
    path('debug/difficulty-stats/', views_debug.get_word_difficulty_stats, name='get_word_difficulty_stats'),
]