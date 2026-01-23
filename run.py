from app import create_app

app = create_app()

if __name__ == '__main__':
    # Helyi hálózaton elérhető, debug módban teszteléshez
    # Raspberry Pi-n majd host='0.0.0.0' kell
    app.run(host='0.0.0.0', port=8991, debug=True)
