"""
URL configuration for flip_project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from .views import test_view, js_redirect_view, custom_logout
from django.contrib.auth import views as auth_views 
from flip_project import views  
from django.utils.cache import patch_response_headers

# Add the cache headers middleware
def add_cache_headers(get_response):
    def middleware(request):
        response = get_response(request)
        if request.path.startswith('/static/'):
            patch_response_headers(response, cache_timeout=60)  # 1 minute for testing
        return response
    return middleware

urlpatterns = [
    path('admin/', admin.site.urls),
    path('redirect-to-login/', views.js_redirect_view, name='js_redirect'),
    path('', include('spelling_game.urls')),
    path('logout/', views.custom_logout, name='logout'),
    # Main application URLs
    path('', views.home, name='home'),
    path('test/', views.test_view, name='test'),
    path('auth/callback/', views.auth_callback, name='auth_callback'),

]

# Add this middleware function
class CacheHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/static/'):
            patch_response_headers(response, cache_timeout=60)  # 1 minute for testing
        return response
    
from django.core.signals import request_finished
# For serving static files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)