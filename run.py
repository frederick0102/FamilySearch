import os
from app import create_app

app = create_app()

if __name__ == '__main__':
    # Konfiguráció környezeti változókból
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    port = int(os.environ.get('FLASK_PORT', 8991))
    
    # Production: debug=False, development: debug=True
    # Raspberry Pi-n: FLASK_DEBUG=false
    app.run(host='0.0.0.0', port=port, debug=debug)
