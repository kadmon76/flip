from django.shortcuts import render

def index(request):
    """
    Main view for the spelling game
    """
    return render(request, 'spelling_game/index.html')