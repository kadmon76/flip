# spelling_game/middleware.py
from datetime import datetime
from .models import GameSession

class GameSessionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Code to be executed for each request before the view is called
        if request.user.is_authenticated and 'game' in request.path:
            # Check if there's an active session
            session = GameSession.objects.filter(
                user=request.user,
                end_time__isnull=True
            ).first()
            
            if not session:
                # Create a new session
                session = GameSession(
                    user=request.user,
                    device_type=self._get_device_type(request),
                    browser_info=request.META.get('HTTP_USER_AGENT', '')[:255]
                )
                session.save()
                
            # Store the session ID in the request
            request.game_session_id = session.id

        response = self.get_response(request)
        return response
    
    def _get_device_type(self, request):
        user_agent = request.META.get('HTTP_USER_AGENT', '').lower()
        if 'mobile' in user_agent:
            return 'mobile'
        elif 'tablet' in user_agent:
            return 'tablet'
        else:
            return 'desktop'

class DevAuthMiddleware:
    """Middleware to bypass authentication in development mode"""
    
class DevAuthMiddleware:
    """Middleware to bypass authentication in development mode"""
    
    def __init__(self, get_response):
        self.get_response = get_response
        
    def __call__(self, request):
        # Check if we're in development mode BEFORE any other processing
        if (request.get_host() == '127.0.0.1:8080' or 
            request.get_host() == 'localhost:8080' or 
            request.get_host() == '139.162.135.47:8080'):
            
            # Import auth modules
            from django.contrib.auth import login
            from django.contrib.auth.models import User
            from django.contrib import auth
            
            # Create test user if needed
            test_user, created = User.objects.get_or_create(
                username='test_dev',
                defaults={
                    'email': 'test@example.com',
                    'is_staff': True
                }
            )
            
            if created:
                test_user.set_password('testpassword')
                test_user.save()
            
            # Force authentication
            request.user = test_user
            
            # Set backend (required for login to work properly)
            test_user.backend = 'django.contrib.auth.backends.ModelBackend'
            
            # Login the user explicitly
            login(request, test_user)
            
            # Set session key to avoid re-authentication
            request.session['_auth_user_id'] = str(test_user.id)
            request.session['_auth_user_backend'] = 'django.contrib.auth.backends.ModelBackend'
            request.session.modified = True
            
            # Set a flag to prevent CrossSiteAuthMiddleware from redirecting
            request.session['dev_authenticated'] = True
        
        # Continue processing
        response = self.get_response(request)
        return response
    
    # Keep process_view as backup
    def process_view(self, request, view_func, view_args, view_kwargs):
        return None