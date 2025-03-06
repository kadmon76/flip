import os
import sys

# Add the project directory to the Python path
path = '/srv/www/flip'
if path not in sys.path:
    sys.path.insert(0, path)

# Set the DJANGO_SETTINGS_MODULE environment variable
os.environ['DJANGO_SETTINGS_MODULE'] = 'flip_project.settings'

# Import and activate Django
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
