import requests
from django.shortcuts import redirect
from django.contrib.auth import get_user_model, login
from django.conf import settings

User = get_user_model()

class CrossSiteAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        print("CrossSiteAuthMiddleware is running!")
        # Skip authentication for static files, admin, etc.
        exempt_paths = ['/static/', '/media/', '/admin/']
        if any(request.path.startswith(path) for path in exempt_paths):
            return self.get_response(request)

        # If user is already authenticated, proceed
        if request.user.is_authenticated:
            return self.get_response(request)

        # Check if there's an auth_token in the URL
        auth_token = request.GET.get('auth_token')
        
        if auth_token:
            # Verify the token with the main site
            try:
                # Use environment-specific URL
                verify_url = 'https://yaronl.com/auth/verify-token/'
                if settings.DEBUG:
                    # Use HTTP for local development if necessary
                    verify_url = verify_url.replace('https://', 'http://')
                
                response = requests.post(
                    verify_url,
                    data={'token': auth_token}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data.get('success'):
                        # Get or create the user
                        username = data.get('username')
                        email = data.get('email')
                        
                        user, created = User.objects.get_or_create(
                            username=username,
                            defaults={
                                'email': email,
                            }
                        )
                        
                        # Log the user in
                        login(request, user, backend='django.contrib.auth.backends.ModelBackend')
                        
                        # Redirect to remove the token from URL
                        original_url = request.path
                        return redirect(original_url)
            
            except Exception as e:
                print(f"Authentication error: {str(e)}")
                # You might want to log this error
        
        # If no token or authentication failed, redirect to main site login
        current_url = request.build_absolute_uri()
        
        # Handle protocol based on environment
        main_site_url = 'https://yaronl.com'
        if settings.DEBUG:
            # For local development, you might need to use HTTP
            # or a different domain/port configuration
            main_site_url = 'http://yaronl.com'  # Adjust as needed
            
            # If you're testing locally with different ports
            # main_site_url = 'http://localhost:8000'
        
        login_url = f"{main_site_url}/login/?next=/auth/generate-token/?next={current_url}"
        return redirect(login_url)