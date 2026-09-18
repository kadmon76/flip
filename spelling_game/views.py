# spelling_game/views.py
from django.http import JsonResponse
from django.shortcuts import render


def index(request):
    """Main game view. Free to play: no login (CLAUDE.md product rules)."""
    return render(request, 'spelling_game/index.html')


def health(request):
    """Liveness check for deploy/monitoring. No auth, no DB."""
    return JsonResponse({"ok": True})
