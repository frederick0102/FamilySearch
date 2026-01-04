from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
import os

db = SQLAlchemy()

def create_app():
    app = Flask(__name__, static_folder='../static', template_folder='../templates')
    
    # Konfiguráció
    app.config['SECRET_KEY'] = 'családfa-secret-key-2024'
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'familytree.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'uploads')
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
