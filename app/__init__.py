from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

db = SQLAlchemy()

def create_app():
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    
    # Alap útvonalak
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, '..', 'data')
    
    # Data mappa létrehozása (adatbázisnak)
    os.makedirs(data_dir, exist_ok=True)
    
    # Konfiguráció
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'családfa-secret-key-2024')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(data_dir, 'familytree.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = os.path.join(base_dir, '..', 'static', 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max fájlméret
    
    # Upload mappa létrehozása
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # CORS engedélyezése helyi hálózathoz
    CORS(app)
    
    # Adatbázis inicializálás
    db.init_app(app)
    
    # Blueprint-ek regisztrálása
    from app.routes import main_bp, api_bp
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp, url_prefix='/api')
    
    # Adatbázis táblák létrehozása
    with app.app_context():
        db.create_all()
    
    return app
