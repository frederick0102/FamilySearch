"""
Backup rendszer a családfa adatbázishoz.
Automatikus mentés minden módosításnál, és visszaállítási lehetőség.
"""

import os
import shutil
import json
from datetime import datetime, timedelta
from functools import wraps
from flask import current_app


class BackupManager:
    """Adatbázis backup kezelő"""
    
    MAX_BACKUPS = 100  # Maximum tárolt backup-ok száma
    AUTO_BACKUP_INTERVAL = 300  # 5 perc - minimum idő két automatikus backup között
    
    def __init__(self, app=None):
        self.app = app
        self._last_auto_backup = None
        
    def init_app(self, app):
        self.app = app
        
    @property
    def backup_dir(self):
        """Backup könyvtár elérési útja"""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        backup_path = os.path.join(base_dir, '..', 'data', 'backups')
        os.makedirs(backup_path, exist_ok=True)
        return backup_path
    
    @property
    def db_path(self):
        """Adatbázis fájl elérési útja"""
        base_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(base_dir, '..', 'data', 'familytree.db')
    
    def create_backup(self, trigger='manual', description=None):
        """
        Backup létrehozása.
        
        Args:
            trigger: 'auto', 'manual', 'scheduled'
            description: Opcionális leírás
            
        Returns:
            dict: Backup információk
        """
        from app.models import BackupLog
        from app import db
        
        if not os.path.exists(self.db_path):
            return {'error': 'Adatbázis fájl nem található'}
        
        # Fájlnév generálása
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'familytree_backup_{timestamp}.db'
        backup_path = os.path.join(self.backup_dir, filename)
        
        try:
            # Fájl másolása
            shutil.copy2(self.db_path, backup_path)
            file_size = os.path.getsize(backup_path)
            
            # Napló bejegyzés
            log = BackupLog(
                filename=filename,
                file_size=file_size,
                trigger=trigger,
                description=description
            )
            db.session.add(log)
            db.session.commit()
            
            # Régi backup-ok törlése
            self._cleanup_old_backups()
            
            return {
                'success': True,
                'filename': filename,
                'file_size': file_size,
                'created_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    def auto_backup(self, description=None):
        """
        Automatikus backup - throttled, hogy ne legyen túl sok.
        Csak akkor fut, ha elég idő telt el az utolsó óta.
        """
        now = datetime.now()
        
        if self._last_auto_backup:
            elapsed = (now - self._last_auto_backup).total_seconds()
            if elapsed < self.AUTO_BACKUP_INTERVAL:
                return None  # Még nem telt el elég idő
        
        self._last_auto_backup = now
        return self.create_backup(trigger='auto', description=description)
    
    def list_backups(self):
        """Összes backup listázása"""
        from app.models import BackupLog
        
        backups = BackupLog.query.order_by(BackupLog.created_at.desc()).all()
        
        # Ellenőrizzük, hogy a fájlok léteznek-e
        result = []
        for backup in backups:
            backup_path = os.path.join(self.backup_dir, backup.filename)
            exists = os.path.exists(backup_path)
            
            data = backup.to_dict()
            data['exists'] = exists
            data['file_size_mb'] = round(backup.file_size / (1024 * 1024), 2) if backup.file_size else 0
            result.append(data)
        
        return result
    
    def restore_backup(self, backup_id):
        """
        Backup visszaállítása.
        Először készít egy mentést a jelenlegi állapotról!
        
        Args:
            backup_id: A visszaállítandó backup ID-ja
            
        Returns:
            dict: Eredmény
        """
        from app.models import BackupLog
        from app import db
        
        backup = BackupLog.query.get(backup_id)
        if not backup:
            return {'error': 'Backup nem található'}
        
        backup_path = os.path.join(self.backup_dir, backup.filename)
        if not os.path.exists(backup_path):
            return {'error': 'Backup fájl nem található'}
        
        try:
            # Először mentjük a jelenlegi állapotot
            self.create_backup(
                trigger='auto', 
                description=f'Automatikus mentés visszaállítás előtt (#{backup_id})'
            )
            
            # Adatbázis kapcsolatok bezárása
            db.session.remove()
            db.engine.dispose()
            
            # Fájl visszamásolása
            shutil.copy2(backup_path, self.db_path)
            
            return {
                'success': True,
                'message': f'Sikeresen visszaállítva: {backup.filename}',
                'restored_from': backup.created_at.isoformat()
            }
            
        except Exception as e:
            return {'error': str(e)}
    
    def delete_backup(self, backup_id):
        """Backup törlése"""
        from app.models import BackupLog
        from app import db
        
        backup = BackupLog.query.get(backup_id)
        if not backup:
            return {'error': 'Backup nem található'}
        
        backup_path = os.path.join(self.backup_dir, backup.filename)
        
        try:
            # Fájl törlése
            if os.path.exists(backup_path):
                os.remove(backup_path)
            
            # Napló törlése
            db.session.delete(backup)
            db.session.commit()
            
            return {'success': True}
            
        except Exception as e:
            return {'error': str(e)}
    
    def _cleanup_old_backups(self):
        """Régi backup-ok törlése, ha túl sok van"""
        from app.models import BackupLog
        from app import db
        
        count = BackupLog.query.count()
        
        if count > self.MAX_BACKUPS:
            # A legrégebbi backup-ok törlése
            old_backups = BackupLog.query.order_by(
                BackupLog.created_at.asc()
            ).limit(count - self.MAX_BACKUPS).all()
            
            for backup in old_backups:
                self.delete_backup(backup.id)
    
    def get_backup_stats(self):
        """Backup statisztikák"""
        from app.models import BackupLog
        
        total = BackupLog.query.count()
        total_size = sum([b.file_size or 0 for b in BackupLog.query.all()])
        
        last_backup = BackupLog.query.order_by(
            BackupLog.created_at.desc()
        ).first()
        
        return {
            'total_backups': total,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'max_backups': self.MAX_BACKUPS,
            'last_backup': last_backup.to_dict() if last_backup else None
        }


# Singleton instance
backup_manager = BackupManager()


def auto_backup_on_change(description=None):
    """
    Dekorátor, ami automatikus backup-ot készít adatmódosító műveletek után.
    
    Használat:
        @auto_backup_on_change("Személy módosítva")
        def update_person(...):
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            result = f(*args, **kwargs)
            # Csak sikeres művelet után
            if result and not isinstance(result, tuple):
                backup_manager.auto_backup(description)
            elif isinstance(result, tuple) and len(result) >= 2:
                response, status_code = result[0], result[1]
                if 200 <= status_code < 300:
                    backup_manager.auto_backup(description)
            return result
        return decorated_function
    return decorator
