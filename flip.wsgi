import sys
import os

# Add the project directory to the Python path
sys.path.insert(0, '/srv/www/flip')

# Add the virtual environment site-packages to the Python path
venv_path = '/srv/www/flip/venv/lib/python3.8.10/site-packages'  # Replace 'python3.x' with the correct version
sys.path.insert(0, venv_path)

# Set environment variables if needed
os.environ['FLASK_ENV'] = 'production'  # Optional: Set environment variables

# Import the Flask app as the WSGI application
from app import app as application

