# spelling_game/views.py
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render


@login_required
def index(request):
    """Main game view"""
    return render(request, 'spelling_game/index.html')


def health(request):
    """Liveness check for deploy/monitoring. No auth, no DB."""
    return JsonResponse({"ok": True})
