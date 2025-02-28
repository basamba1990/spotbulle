from sqlalchemy.orm import Session
from . import models, schemas
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Hasher le mot de passe
def hash_password(password: str):
    return pwd_context.hash(password)

# Vérifier le mot de passe
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

# 🔹 CREATE : Ajouter un utilisateur
def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = hash_password(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# 🔹 READ : Récupérer un utilisateur par ID
def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

# 🔹 READ : Récupérer un utilisateur par nom d'utilisateur
def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

# 🔹 UPDATE : Modifier un utilisateur
def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        return None
    if user_update.username:
        db_user.username = user_update.username
    if user_update.password:
        db_user.hashed_password = hash_password(user_update.password)
    db.commit()
    db.refresh(db_user)
    return db_user

# 🔹 DELETE : Supprimer un utilisateur
def delete_user(db: Session, user_id: int):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user
