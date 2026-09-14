# spelling_game/views.py
from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def index(request):
    """Main game view"""
    return render(request, 'spelling_game/index.html')
