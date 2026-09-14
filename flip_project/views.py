from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render, redirect
from django.contrib.auth import logout
from urllib.parse import quote
import logging
import sys

logger = logging.getLogger('auth_middleware')

def custom_logout(request):
    """
    Enhanced logout view that immediately redirects to the main site.
    No intermediate pages that could create security issues.
    """
    # Log for debugging only
    logger.info("="*80)
    logger.info("CUSTOM LOGOUT VIEW CALLED!")
    logger.info(f"User before logout: {request.user}")
    
    # Perform logout
    logout(request)
    
    logger.info(f"User after logout: {request.user}")
    
    # Get the return URL - default to yaronl.com login page
    return_to = request.GET.get('return_to', 'https://yaronl.com/login/')
    
    # Check if this is a global logout request
    is_global = request.GET.get('global') == 'true'
    
    logger.info(f"Global logout: {is_global}")
    logger.info(f"Return URL: {return_to}")
    logger.info("="*80)
    
    if is_global:
        # For global logout, redirect to main site logout
        encoded_return = quote(return_to)
        logout_url = f"https://yaronl.com/logout/?return_to={encoded_return}"
        logger.info(f"Redirecting to main site logout: {logout_url}")
        return redirect(logout_url)
    
    # Immediately redirect to the specified return URL
    logger.info(f"Redirecting to: {return_to}")
    
    # Create redirect response
    response = redirect(return_to)
    
    # Delete the session cookie
    response.delete_cookie('sessionid')
    
    return response

def test_view(request):
    """A view that displays user information"""
    logger.info("Test view was called!")
    
    context = {
        'is_authenticated': request.user.is_authenticated,
    }
    
    if request.user.is_authenticated:
        context['username'] = request.user.username
        context['email'] = request.user.email
        logger.info(f"Authenticated user: {request.user.username}")
    
    return render(request, 'spelling_game/test_page.html', context)

def js_redirect_view(request):
    """
    Enhanced redirect view that includes the current URL in the redirect
    to enable returning to the originally requested page after login
    """
    # Get the URL to redirect back to after login
    next_url = request.GET.get('next', request.build_absolute_uri('/'))
    
    # Encode it for the redirect URL
    encoded_url = quote(next_url)
    
    # Create the login URL with the redirect parameter
    login_url = f"https://yaronl.com/login/?redirect_to={encoded_url}"
    
    logger.info(f"JS redirecting to: {login_url}")
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Redirecting to login...</title>
        <script>
            // Redirect after a brief delay
            setTimeout(function() {{
                window.location.href = "{login_url}";
            }}, 1000);
        </script>
        <style>
            body {{
                font-family: Arial, sans-serif;
                line-height: 1.6;
                max-width: 600px;
                margin: 40px auto;
                padding: 20px;
                text-align: center;
            }}
            .redirect-progress {{
                height: 8px;
                background-color: #ebebeb;
                border-radius: 4px;
                margin: 20px 0;
                overflow: hidden;
            }}
            .progress-bar {{
                height: 100%;
                width: 0;
                background-color: #4285f4;
                transition: width 0.1s ease;
            }}
            h1 {{
                color: #333;
            }}
            a {{
                color: #4285f4;
                text-decoration: none;
            }}
            a:hover {{
                text-decoration: underline;
            }}
        </style>
    </head>
    <body>
        <h1>Authentication Required</h1>
        <p>You need to be logged in to access this page.</p>
        <p>You will be redirected to the login page momentarily...</p>
        
        <div class="redirect-progress">
            <div class="progress-bar" id="progress-bar"></div>
        </div>
        
        <p>If you are not redirected automatically, <a href="{login_url}">click here to log in</a>.</p>
        
        <script>
            // Animate the progress bar
            var progressBar = document.getElementById('progress-bar');
            var width = 0;
            var interval = setInterval(function() {{
                if (width >= 100) {{
                    clearInterval(interval);
                }} else {{
                    width += 5;
                    progressBar.style.width = width + '%';
                }}
            }}, 50);
        </script>
    </body>
    </html>
    """
    return HttpResponse(html)

def auth_callback(request):
    """
    Handle authentication callbacks from the main site.
    This endpoint receives the auth token and redirects to the target URL.
    """
    logger.info(f"Processing auth callback: {request.build_absolute_uri()}")
    
    auth_token = request.GET.get('auth_token')
    # Default to root URL if no specific redirect is provided
    redirect_to = request.GET.get('redirect_to', '/')
    
    if not auth_token:
        logger.error("Auth callback missing auth_token parameter")
        return HttpResponse("Authentication failed: No token provided", status=400)
    
    # Append the auth token to the redirect URL
    if '?' in redirect_to:
        redirect_url = f"{redirect_to}&auth_token={auth_token}"
    else:
        redirect_url = f"{redirect_to}?auth_token={auth_token}"
    
    logger.info(f"Auth callback redirecting to: {redirect_url}")
    return redirect(redirect_url)

def home(request):
    """
    Homepage view that shows authentication status
    """
    context = {
        'is_authenticated': request.user.is_authenticated,
        'current_url': request.build_absolute_uri(),
    }
    
    if request.user.is_authenticated:
        context['username'] = request.user.username
        context['email'] = request.user.email
    
    return render(request, 'home.html', context)