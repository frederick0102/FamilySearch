"""
Autentikáció a családfa alkalmazáshoz.
Egyszerű jelszó-alapú védelem bcrypt titkosítással.
"""

from functools import wraps
from flask import session, redirect, url_for, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash


# Alapértelmezett jelszó - szójáték: "Ivett" és "családfakutatás 2026"
# Ivett2026Családfa - könnyen megjegyezhető
DEFAULT_PASSWORD = 'Ivett2026Családfa'


def get_password_hash():
    """Jelszó hash lekérése az adatbázisból"""
    from app.models import AppSettings
    return AppSettings.get('password_hash')


def set_password(new_password):
    """
    Új jelszó beállítása.
    
    Args:
        new_password: Az új jelszó plain text-ben
        
    Returns:
        bool: Sikeres volt-e
    """
    from app.models import AppSettings
    
    if not new_password or len(new_password) < 4:
        return False
    
    password_hash = generate_password_hash(new_password, method='pbkdf2:sha256')
    AppSettings.set('password_hash', password_hash)
    return True


def verify_password(password):
    """
    Jelszó ellenőrzése.
    
    Args:
        password: A beírt jelszó
        
    Returns:
        bool: Helyes-e a jelszó
    """
    stored_hash = get_password_hash()
    
    # Ha még nincs jelszó beállítva, az alapértelmezettet használjuk
    if not stored_hash:
        if password == DEFAULT_PASSWORD:
            # Első bejelentkezéskor mentjük az alapértelmezett jelszót
            set_password(DEFAULT_PASSWORD)
            return True
        return False
    
    return check_password_hash(stored_hash, password)


def change_password(current_password, new_password):
    """
    Jelszó megváltoztatása.
    
    Args:
        current_password: A jelenlegi jelszó
        new_password: Az új jelszó
        
    Returns:
        dict: Eredmény
    """
    if not verify_password(current_password):
        return {'error': 'Hibás jelenlegi jelszó'}
    
    if not new_password or len(new_password) < 4:
        return {'error': 'Az új jelszónak legalább 4 karakter hosszúnak kell lennie'}
    
    if set_password(new_password):
        return {'success': True, 'message': 'Jelszó sikeresen megváltoztatva'}
    else:
        return {'error': 'Hiba történt a jelszó mentésekor'}


def is_authenticated():
    """Ellenőrzi, hogy a felhasználó be van-e jelentkezve"""
    return session.get('authenticated', False)


def login_user():
    """Bejelentkezés session-be"""
    session['authenticated'] = True
    session.permanent = True  # 31 napos session


def logout_user():
    """Kijelentkezés"""
    session.pop('authenticated', None)


def login_required(f):
    """
    Dekorátor, ami védi az útvonalakat.
    Ha nincs bejelentkezve, átirányít a login oldalra.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_authenticated():
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Nincs bejelentkezve', 'redirect': '/login'}), 401
            return redirect(url_for('main.login'))
        return f(*args, **kwargs)
    return decorated_function


def api_login_required(f):
    """
    Dekorátor API útvonalakhoz.
    JSON választ ad hiba esetén.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_authenticated():
            return jsonify({'error': 'Nincs bejelentkezve', 'redirect': '/login'}), 401
        return f(*args, **kwargs)
    return decorated_function
