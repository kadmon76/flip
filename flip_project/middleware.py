import requests
import logging
from django.shortcuts import redirect
from django.http import HttpResponse, HttpResponseRedirect
from django.contrib.auth import get_user_model, login, logout
from django.conf import settings
from django.urls import reverse
from urllib.parse import quote

# Set up logger
logger = logging.getLogger('auth_middleware')

User = get_user_model()

class DebuggingMiddleware:
    """Middleware that logs detailed request/response information"""
    
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("DebuggingMiddleware initialized")

    def __call__(self, request):
        # Log request details safely
        logger.info("="*50)
        logger.info(f"DEBUG REQUEST: {request.method} {request.path}")
        logger.info(f"DEBUG COOKIES: {request.COOKIES}")
        
        # Development bypass for localhost:8080
        if request.get_host() in ['localhost:8080', '127.0.0.1:8080']:
            logger.info("Development environment detected")
            
            # Process the request first to let authentication middleware run
            response = self.get_response(request)
            
            # After response, we can access request.user
            if hasattr(request, 'user') and not request.user.is_authenticated:
                from django.contrib.auth import login
                from django.contrib.auth.models import User
                
                # Find or create a test user
                test_user, created = User.objects.get_or_create(
                    username='dev_test_user',
                    defaults={
                        'email': 'dev@example.com',
                    }
                )
                
                if created:
                    logger.info("Created development test user")
                else:
                    logger.info("Using existing development test user")
                
                # Log the user in
                login(request, test_user, backend='django.contrib.auth.backends.ModelBackend')
                logger.info(f"Development user {test_user.username} has been logged in")
            
            # Log debug info
            if hasattr(request, 'user'):
                logger.info(f"DEBUG USER: {request.user} (Authenticated: {request.user.is_authenticated})")
            else:
                logger.info("DEBUG USER: Not available")
            
            logger.info(f"DEBUG RESPONSE: {type(response)} {getattr(response, 'status_code', 'N/A')}")
            if hasattr(response, 'cookies'):
                logger.info(f"DEBUG RESPONSE COOKIES: {response.cookies}")
            logger.info("="*50)
            
            return response
        
        # Normal flow for non-development environments
        response = self.get_response(request)
        
        # Now it's safe to access request.user after other middleware has run
        if hasattr(request, 'user'):
            logger.info(f"DEBUG USER: {request.user} (Authenticated: {request.user.is_authenticated})")
        else:
            logger.info("DEBUG USER: Not available")
        
        # Log response details
        logger.info(f"DEBUG RESPONSE: {type(response)} {getattr(response, 'status_code', 'N/A')}")
        if hasattr(response, 'cookies'):
            logger.info(f"DEBUG RESPONSE COOKIES: {response.cookies}")
        logger.info("="*50)
        
        return response
    
class CrossSiteAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        logger.info("CrossSiteAuthMiddleware initialized")

    def __call__(self, request):
        logger.info(f"Processing request: {request.method} {request.build_absolute_uri()}")
        if request.session.get('dev_authenticated', False):
            return self.get_response(request)
        # Skip authentication for development environment
        if request.get_host() in ['localhost:8080', '127.0.0.1:8080']:
            logger.info("Development environment detected in CrossSiteAuthMiddleware, bypassing authentication")
            
            # First process the request to let AuthenticationMiddleware run
            response = self.get_response(request)
            
            # Check if we need to add a test user after response
            if hasattr(request, 'user') and not request.user.is_authenticated:
                # Find or create a test user
                test_user, created = User.objects.get_or_create(
                    username='dev_test_user',
                    defaults={
                        'email': 'dev@example.com',
                    }
                )
                
                if created:
                    logger.info("Created development test user")
                else:
                    logger.info("Using existing development test user")
                
                # Log the user in
                login(request, test_user, backend='django.contrib.auth.backends.ModelBackend')
                logger.info(f"Development user {test_user.username} has been logged in")
            
            return response
        
        # Skip authentication for static files, admin, etc.
        exempt_paths = [
            '/static/', 
            '/media/', 
            '/admin/', 
            '/redirect-to-login/', 
            '/logout/',
            '/auth/callback/',
            '/health-check/',
            '/favicon.ico',
        ]
        
        if any(request.path.startswith(path) for path in exempt_paths):
            logger.info(f"Path {request.path} is exempt from auth middleware")
            return self.get_response(request)

        # If user is already authenticated, proceed
        if request.user.is_authenticated:
            logger.info(f"User {request.user.username} is already authenticated")
            return self.get_response(request)

        # Rest of your original code remains unchanged
        # Check if there's an auth_token in the URL
        auth_token = request.GET.get('auth_token')
        
        if auth_token:
            logger.info(f"Auth token found in request: {auth_token}")
            
            # Check if token is in our simple format: authenticate_username
            if auth_token.startswith('authenticate_'):
                try:
                    username = auth_token.split('authenticate_')[1]
                    logger.info(f"Simple auth format found, username: {username}")
                    
                    # Find the user
                    try:
                        # Try to get the user first
                        try:
                            user = User.objects.get(username=username)
                            logger.info(f"Found existing user: {username}")
                        except User.DoesNotExist:
                            # Create the user if they don't exist
                            user = User.objects.create_user(
                                username=username,
                                email=f"{username}@example.com"  # Use a placeholder email
                            )
                            logger.info(f"Created new user: {username}")
                        
                        # Log the user in
                        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
                        logger.info(f"User {username} has been logged in")
                        
                        # Complete the request first so the login is processed
                        response = self.get_response(request)
                        
                        # Only redirect if this was a GET request
                        if request.method == 'GET':
                            # If we're on the /test/ path, redirect to the root URL instead
                            if request.path == '/test/':
                                logger.info(f"Detected /test/ path, redirecting to root URL")
                                return redirect('/')
                                
                            # Otherwise prepare the redirect URL (without the auth_token)
                            redirect_url = request.path
                            query_params = request.GET.copy()
                            query_params.pop('auth_token')
                            
                            if query_params:
                                redirect_url += '?' + '&'.join([f"{key}={value}" for key, value in query_params.items()])
                            
                            logger.info(f"Redirecting to: {redirect_url}")
                            return redirect(redirect_url)
                        
                        return response
                    except Exception as e:
                        logger.error(f"Error creating/logging in user: {str(e)}", exc_info=True)
                
                except Exception as e:
                    logger.error(f"Simple auth error: {str(e)}", exc_info=True)
            
            # If not in simple format, try the original token verification
            else:
                try:
                    verify_url = 'https://yaronl.com/auth/verify-token/'
                    logger.info(f"Verifying token with: {verify_url}")
                    
                    response = requests.post(
                        verify_url,
                        data={'token': auth_token},
                        timeout=10  # Add timeout to prevent hanging
                    )
                    
                    logger.info(f"Token verification response: status={response.status_code}")
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        if data.get('success'):
                            # Get or create the user
                            username = data.get('username')
                            email = data.get('email')
                            
                            logger.info(f"Authentication successful for user: {username}")
                            
                            user, created = User.objects.get_or_create(
                                username=username,
                                defaults={
                                    'email': email,
                                }
                            )
                            
                            if created:
                                logger.info(f"Created new user: {username}")
                            else:
                                logger.info(f"Using existing user: {username}")
                            
                            # Log the user in
                            login(request, user, backend='django.contrib.auth.backends.ModelBackend')
                            logger.info(f"User {username} has been logged in")
                            
                            # Complete the request first so the login is processed
                            response = self.get_response(request)
                            
                            # Only redirect if this was a GET request
                            if request.method == 'GET':
                                # If we're on the /test/ path, redirect to the root URL instead
                                if request.path == '/test/':
                                    logger.info(f"Detected /test/ path, redirecting to root URL")
                                    return redirect('/')
                                    
                                # Otherwise prepare the redirect URL (without the auth_token)
                                redirect_url = request.path
                                query_params = request.GET.copy()
                                query_params.pop('auth_token')
                                
                                if query_params:
                                    redirect_url += '?' + '&'.join([f"{key}={value}" for key, value in query_params.items()])
                                
                                logger.info(f"Redirecting to: {redirect_url}")
                                return redirect(redirect_url)
                            
                            return response
                        else:
                            logger.warning(f"Token verification failed: {data}")
                    else:
                        logger.warning(f"Token verification failed with status code: {response.status_code}")
                
                except Exception as e:
                    logger.error(f"Authentication error: {str(e)}", exc_info=True)
        else:
            logger.info("No auth token found in request")
        
        # If no token or authentication failed, redirect to main site login
        if 'auth_token' in request.GET:
            logger.warning("Auth token attempt failed, showing error page instead of redirecting")
            return HttpResponse(
                "<h1>Authentication Failed</h1>"
                "<p>Could not authenticate with the provided token.</p>"
                "<p><a href='https://yaronl.com/login/'>Try logging in again</a></p>"
            )
        else:
            # Save the current URL to redirect back after login
            # BUT change /test/ to / to avoid redirecting there after login
            if request.path == '/test/':
                redirect_to = request.build_absolute_uri('/').rstrip('/')
            else:
                redirect_to = request.build_absolute_uri()
            
            # URL encode the current URL for passing to yaronl.com
            encoded_url = quote(redirect_to)
            
            login_url = f"https://yaronl.com/login/?redirect_to={encoded_url}"
            logger.info(f"Redirecting to login: {login_url}")
            
            return redirect(login_url)
        
def process_global_logout(request):
    """
    Handles logout for the current site and optionally redirects to the main site
    to complete a global logout.
    """
    # Log the user out of the current site
    logout(request)
    
    # Check if this is a global logout request
    if request.GET.get('global') == 'true':
        # Redirect to main site logout
        return_url = request.GET.get('return_to', 'https://flip.yaronl.com/')
        encoded_return = quote(return_url)
        return redirect(f"https://yaronl.com/logout/?return_to={encoded_return}")
    
    # If not global, just redirect to the homepage or specified URL
    return redirect(request.GET.get('return_to', '/'))

class MobileDetectionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Check if request is from mobile
        user_agent = request.META.get('HTTP_USER_AGENT', '').lower()
        is_mobile = any(x in user_agent for x in ['android', 'iphone', 'ipad', 'mobile'])
        
        # Add to request for view usage
        request.is_mobile = is_mobile
        
        response = self.get_response(request)
        return response