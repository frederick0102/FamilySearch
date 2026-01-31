from app import db
from datetime import datetime

class Person(db.Model):
    """Személy adatmodell - minden családtag"""
    __tablename__ = 'persons'
    
    id = db.Column(db.Integer, primary_key=True)
    
    # Alapadatok
    first_name = db.Column(db.String(100), nullable=False)
    middle_name = db.Column(db.String(100))
    last_name = db.Column(db.String(100), nullable=False)
    maiden_name = db.Column(db.String(100))  # Leánykori név
    nickname = db.Column(db.String(100))  # Becenév
    
    # Nem
    gender = db.Column(db.String(20), default='unknown')  # male, female, unknown
    
    # Születési adatok
    birth_date = db.Column(db.Date)
    birth_date_approximate = db.Column(db.Boolean, default=False)  # Becsült dátum
    birth_place = db.Column(db.String(200))
    birth_country = db.Column(db.String(100))
    
    # Halálozási adatok
    death_date = db.Column(db.Date)
    death_date_approximate = db.Column(db.Boolean, default=False)
    death_date_unknown = db.Column(db.Boolean, default=False)  # Nem ismert dátum
    death_place = db.Column(db.String(200))
    death_country = db.Column(db.String(100))
    death_cause = db.Column(db.String(500))  # Halál oka
    burial_place = db.Column(db.String(200))  # Temetkezési hely
    
    # Életrajzi adatok
    occupation = db.Column(db.String(200))  # Foglalkozás
    education = db.Column(db.String(300))  # Iskolai végzettség
    religion = db.Column(db.String(100))  # Vallás
    nationality = db.Column(db.String(100))  # Nemzetiség
    
    # Elérhetőségek (élő személyeknél)
    email = db.Column(db.String(200))
    phone = db.Column(db.String(50))
    address = db.Column(db.String(300))
    
    # Megjegyzések és egyéb
    biography = db.Column(db.Text)  # Életrajz
    notes = db.Column(db.Text)  # Megjegyzések
    
    # Média
    photo_path = db.Column(db.String(500))  # Profilkép útvonal
    
    # Metaadatok
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Egyéni mezők (JSON formátumban)
    custom_fields = db.Column(db.Text)  # JSON string egyéni mezőkhöz
    
    # ========== KAPCSOLATOK - ÚJ GRÁF-ALAPÚ MODELL ==========
    
    # A család ID-ja, ahol ez a személy GYEREKKÉNT szerepel
    # Ez a KULCS a gráf-alapú modellhez!
    parent_family_id = db.Column(db.Integer, db.ForeignKey('marriages.id'))
    
    # Örökbefogadó család (opcionális)
    adoptive_family_id = db.Column(db.Integer, db.ForeignKey('marriages.id'))
    
    # Iker és születési sorrend
    is_twin = db.Column(db.Boolean, default=False)
    birth_order = db.Column(db.Integer)
    
    # DEPRECATED - Legacy mezők (már nem használjuk, de az oszlopok maradnak a DB-ben)
    # Az új modell a parent_family_id-t használja!
    father_id = db.Column(db.Integer, db.ForeignKey('persons.id'))
    mother_id = db.Column(db.Integer, db.ForeignKey('persons.id'))
    
    # ========== GRÁF-ALAPÚ KAPCSOLATOK ==========
    parent_family = db.relationship('Marriage', foreign_keys=[parent_family_id], backref='biological_children')
    adoptive_family = db.relationship('Marriage', foreign_keys=[adoptive_family_id], backref='adopted_children')
    
    @property
    def full_name(self):
        # Magyar sorrend: vezetéknév + keresztnév (+ középső név)
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return ' '.join(parts)
    
    @property
    def display_name(self):
        # Alap a magyar sorrendű teljes név
        name = self.full_name
        if self.maiden_name:
            name += f' (szül. {self.maiden_name})'
        return name
    
    @property
    def age(self):
        if not self.birth_date:
            return None
        end_date = self.death_date if self.death_date else datetime.now().date()
        age = end_date.year - self.birth_date.year
        if end_date.month < self.birth_date.month or (end_date.month == self.birth_date.month and end_date.day < self.birth_date.day):
            age -= 1
        return age
    
    @property
    def is_alive(self):
        # Ha van halálozási dátum VAGY ha ismeretlen a halál időpontja, akkor halott
        return self.death_date is None and not self.death_date_unknown
    
    @property
    def spouse_families(self):
        """Visszaadja az összes családot, ahol ez a személy partner"""
        from app.models import Marriage
        return Marriage.query.filter(
            (Marriage.person1_id == self.id) | (Marriage.person2_id == self.id)
        ).all()
    
    @property
    def children(self):
        """
        Visszaadja a személy összes gyermekét.
        GRÁF-ALAPÚ MODELL: a gyerekek a családokon (Family) keresztül kapcsolódnak.
        """
        children = []
        children_ids = set()
        
        for family in self.spouse_families:
            for child in family.biological_children:
                if child.id not in children_ids:
                    children_ids.add(child.id)
                    children.append(child)
        
        return children
    
    @property
    def parents(self):
        """
        Visszaadja a személy szüleit.
        GRÁF-ALAPÚ MODELL: a szülők a parent_family-n keresztül érhetők el.
        """
        parents = []
        
        if self.parent_family:
            if self.parent_family.person1:
                parents.append(self.parent_family.person1)
            if self.parent_family.person2:
                parents.append(self.parent_family.person2)
        
        return parents
    
    @property
    def siblings(self):
        """
        Visszaadja a személy testvéreit (teljes testvérek).
        GRÁF-ALAPÚ MODELL: ugyanabból a családból származó gyerekek.
        """
        if not self.parent_family:
            return []
        
        siblings = []
        for child in self.parent_family.biological_children:
            if child.id != self.id:
                siblings.append(child)
        
        return siblings
    
    @property
    def half_siblings(self):
        """
        Visszaadja a féltestvéreket (egy közös szülő).
        GRÁF-ALAPÚ MODELL: más családból származó gyerekek, de közös szülővel.
        """
        if not self.parent_family:
            return []
        
        half_sibs = []
        parent_ids = [self.parent_family.person1_id, self.parent_family.person2_id]
        parent_ids = [pid for pid in parent_ids if pid]
        
        for parent_id in parent_ids:
            parent = Person.query.get(parent_id)
            if not parent:
                continue
            
            for child in parent.children:
                if child.id == self.id:
                    continue
                if child in self.siblings:
                    continue  # Teljes testvér, nem féltestvér
                if child not in half_sibs:
                    half_sibs.append(child)
        
        return half_sibs
    
    def to_dict(self):
        import json
        return {
            'id': self.id,
            'first_name': self.first_name,
            'middle_name': self.middle_name,
            'last_name': self.last_name,
            'maiden_name': self.maiden_name,
            'nickname': self.nickname,
            'full_name': self.full_name,
            'display_name': self.display_name,
            'gender': self.gender,
            'birth_date': self.birth_date.isoformat() if self.birth_date else None,
            'birth_date_approximate': self.birth_date_approximate,
            'birth_place': self.birth_place,
            'birth_country': self.birth_country,
            'death_date': self.death_date.isoformat() if self.death_date else None,
            'death_date_approximate': self.death_date_approximate,
            'death_date_unknown': self.death_date_unknown,
            'death_place': self.death_place,
            'death_country': self.death_country,
            'death_cause': self.death_cause,
            'burial_place': self.burial_place,
            'occupation': self.occupation,
            'education': self.education,
            'religion': self.religion,
            'nationality': self.nationality,
            'email': self.email,
            'phone': self.phone,
            'address': self.address,
            'biography': self.biography,
            'notes': self.notes,
            'photo_path': self.photo_path,
            # Gráf-alapú mezők
            'parent_family_id': self.parent_family_id,
            'adoptive_family_id': self.adoptive_family_id,
            'is_twin': self.is_twin,
            'birth_order': self.birth_order,
            'spouse_family_ids': [f.id for f in self.spouse_families],
            # Szülők (gráf-alapú modellből)
            'parents': [{'id': p.id, 'name': p.full_name} for p in self.parents],
            # Számított mezők
            'age': self.age,
            'is_alive': self.is_alive,
            'custom_fields': json.loads(self.custom_fields) if self.custom_fields else {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class Marriage(db.Model):
    """
    FAMILY (Család/Kapcsolat) - GEDCOM-szerű gráf-alapú modell
    
    Ez egy virtuális csomópont, amely összeköti a partnereket és gyerekeket.
    A gyerekek NEM közvetlenül a szülőkhöz kapcsolódnak, hanem ehhez a Family-hoz!
    
    Megjegyzés: A tábla neve 'marriages' marad a backward compatibility miatt,
    de a logika Family-központú.
    """
    __tablename__ = 'marriages'
    
    id = db.Column(db.Integer, primary_key=True)
    
    # ========== PARTNEREK ==========
    # Partner1 és Partner2 - NEM "apa" és "anya"!
    # Így kezelhető: azonos nemű párok, ismeretlen szülő, stb.
    person1_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=True)  # Lehet NULL: ismeretlen szülő
    person2_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=True)  # Lehet NULL: egyedülálló szülő
    
    # ========== KAPCSOLAT TÍPUSA ==========
    relationship_type = db.Column(db.String(50), default='marriage')
    # Értékek: marriage, civil_partnership, partnership, engagement, relationship, one_night, unknown
    
    # ========== STÁTUSZ ==========
    status = db.Column(db.String(50), default='active')
    # Értékek: active, divorced, widowed, separated, annulled, ended
    
    # ========== DÁTUMOK ==========
    start_date = db.Column(db.Date)      # Házasságkötés dátuma
    end_date = db.Column(db.Date)        # Válás/halálozás dátuma
    end_reason = db.Column(db.String(50))  # divorce, death, annulment, separation
    
    # Helyszín
    marriage_place = db.Column(db.String(200))
    
    # Megjegyzések
    notes = db.Column(db.Text)
    
    # Kapcsolatok
    person1 = db.relationship('Person', foreign_keys=[person1_id], backref='families_as_partner1')
    person2 = db.relationship('Person', foreign_keys=[person2_id], backref='families_as_partner2')
    
    @property
    def children(self):
        """
        A családhoz tartozó gyerekek lekérdezése.
        Gyerek = olyan Person, akinek parent_family_id == self.id
        """
        return Person.query.filter_by(parent_family_id=self.id).all()
    
    @property
    def partner_ids(self):
        """Mindkét partner ID-ja listában"""
        return [pid for pid in [self.person1_id, self.person2_id] if pid]
    
    def get_other_partner(self, person_id):
        """Visszaadja a másik partner ID-ját"""
        if self.person1_id == person_id:
            return self.person2_id
        elif self.person2_id == person_id:
            return self.person1_id
        return None
    
    def to_dict(self):
        return {
            'id': self.id,
            'person1_id': self.person1_id,
            'person2_id': self.person2_id,
            'person1_name': self.person1.full_name if self.person1 else None,
            'person2_name': self.person2.full_name if self.person2 else None,
            'relationship_type': self.relationship_type,
            'status': self.status or 'active',
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'end_reason': self.end_reason,
            'marriage_place': self.marriage_place,
            'notes': self.notes,
            'children_ids': [c.id for c in self.children],
            'children': [{'id': c.id, 'name': c.full_name} for c in self.children]
        }


# Társító tábla: gyerek-család kapcsolat (örökbefogadáshoz)
family_children = db.Table('family_children',
    db.Column('family_id', db.Integer, db.ForeignKey('marriages.id'), primary_key=True),
    db.Column('person_id', db.Integer, db.ForeignKey('persons.id'), primary_key=True),
    db.Column('relationship_type', db.String(50), default='biological'),  # biological, adopted, foster
    db.Column('birth_order', db.Integer),
    db.Column('is_twin', db.Boolean, default=False)
)


class Event(db.Model):
    """Életesemények (keresztelő, konfirmáció, diplomázás, stb.)"""
    __tablename__ = 'events'
    
    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=False)
    
    event_type = db.Column(db.String(100), nullable=False)  # baptism, confirmation, graduation, military, immigration, etc.
    event_date = db.Column(db.Date)
    event_place = db.Column(db.String(200))
    description = db.Column(db.Text)
    
    # Kapcsolat
    person = db.relationship('Person', backref='events')
    
    def to_dict(self):
        return {
            'id': self.id,
            'person_id': self.person_id,
            'event_type': self.event_type,
            'event_date': self.event_date.isoformat() if self.event_date else None,
            'event_place': self.event_place,
            'description': self.description
        }


class Document(db.Model):
    """Dokumentumok és média (fényképek, iratok, stb.)"""
    __tablename__ = 'documents'
    
    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey('persons.id'))
    
    document_type = db.Column(db.String(50))  # photo, certificate, letter, etc.
    title = db.Column(db.String(200))
    description = db.Column(db.Text)
    file_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(50))  # image, pdf, etc.
    upload_date = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Kapcsolat
    person = db.relationship('Person', backref='documents')
    
    def to_dict(self):
        return {
            'id': self.id,
            'person_id': self.person_id,
            'document_type': self.document_type,
            'title': self.title,
            'description': self.description,
            'file_path': self.file_path,
            'file_type': self.file_type,
            'upload_date': self.upload_date.isoformat() if self.upload_date else None
        }


class TreeSettings(db.Model):
    """Családfa megjelenítési beállítások"""
    __tablename__ = 'tree_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), default='default')
    
    # Színek
    male_color = db.Column(db.String(20), default='#4A90D9')
    female_color = db.Column(db.String(20), default='#D94A8C')
    unknown_color = db.Column(db.String(20), default='#808080')
    direct_lineage_color = db.Column(db.String(20), default='#E8B84A')  # Meleg arany - jól látható világos és sötét háttéren
    deceased_opacity = db.Column(db.Float, default=0.7)
    
    # Kapcsolat vonalak
    line_color = db.Column(db.String(20), default='#666666')
    line_width = db.Column(db.Integer, default=2)
    marriage_line_style = db.Column(db.String(20), default='solid')  # solid, dashed
    
    # Kártyák
    card_width = db.Column(db.Integer, default=200)
    card_height = db.Column(db.Integer, default=100)
    card_border_radius = db.Column(db.Integer, default=8)
    show_photos = db.Column(db.Boolean, default=True)
    show_dates = db.Column(db.Boolean, default=True)
    show_places = db.Column(db.Boolean, default=False)
    show_occupation = db.Column(db.Boolean, default=False)
    
    # Háttér
    background_color = db.Column(db.String(20), default='#F5F5F5')
    background_image = db.Column(db.String(500))
    
    # Betűtípus
    font_family = db.Column(db.String(100), default='Arial, sans-serif')
    font_size = db.Column(db.Integer, default=14)
    
    # Alapértelmezett gyökérszemély
    default_root_person_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'male_color': self.male_color,
            'female_color': self.female_color,
            'unknown_color': self.unknown_color,
            'direct_lineage_color': self.direct_lineage_color,
            'deceased_opacity': self.deceased_opacity,
            'line_color': self.line_color,
            'line_width': self.line_width,
            'marriage_line_style': self.marriage_line_style,
            'card_width': self.card_width,
            'card_height': self.card_height,
            'card_border_radius': self.card_border_radius,
            'show_photos': self.show_photos,
            'show_dates': self.show_dates,
            'show_places': self.show_places,
            'show_occupation': self.show_occupation,
            'background_color': self.background_color,
            'background_image': self.background_image,
            'font_family': self.font_family,
            'font_size': self.font_size,
            'default_root_person_id': self.default_root_person_id
        }


class DeletedRecord(db.Model):
    """Soft delete jelölések: entitás típus + azonosító + törlés ideje"""
    __tablename__ = 'deleted_records'

    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String(50), nullable=False)
    entity_id = db.Column(db.Integer, nullable=False)
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }


class AppSettings(db.Model):
    """Alkalmazás beállítások - jelszó és egyéb globális beállítások"""
    __tablename__ = 'app_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    @staticmethod
    def get(key, default=None):
        """Beállítás lekérése kulcs alapján"""
        setting = AppSettings.query.filter_by(key=key).first()
        return setting.value if setting else default
    
    @staticmethod
    def set(key, value):
        """Beállítás mentése"""
        from app import db
        setting = AppSettings.query.filter_by(key=key).first()
        if setting:
            setting.value = value
            setting.updated_at = datetime.utcnow()
        else:
            setting = AppSettings(key=key, value=value)
            db.session.add(setting)
        db.session.commit()
        return setting


class BackupLog(db.Model):
    """Backup napló - automatikus mentések követése"""
    __tablename__ = 'backup_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer)  # bytes
    trigger = db.Column(db.String(50))  # auto, manual, scheduled
    description = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'filename': self.filename,
            'file_size': self.file_size,
            'trigger': self.trigger,
            'description': self.description,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class NodePosition(db.Model):
    """Családfa csomópontok egyedi pozíciói - drag & drop után mentett helyzetek"""
    __tablename__ = 'node_positions'
    
    id = db.Column(db.Integer, primary_key=True)
    person_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=False)
    root_person_id = db.Column(db.Integer, db.ForeignKey('persons.id'), nullable=False)  # Melyik root személynél érvényes ez a pozíció
    
    # Pozíció koordináták
    x = db.Column(db.Float, nullable=False)
    y = db.Column(db.Float, nullable=False)
    
    # Metaadatok
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Kapcsolatok
    person = db.relationship('Person', foreign_keys=[person_id], backref=db.backref('positions', lazy='dynamic'))
    root_person = db.relationship('Person', foreign_keys=[root_person_id])
    
    # Egyedi index: egy személy csak egyszer szerepelhet egy adott root-nál
    __table_args__ = (
        db.UniqueConstraint('person_id', 'root_person_id', name='unique_person_root_position'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'person_id': self.person_id,
            'root_person_id': self.root_person_id,
            'x': self.x,
            'y': self.y,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
