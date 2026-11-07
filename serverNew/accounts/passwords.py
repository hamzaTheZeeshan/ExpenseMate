import bcrypt

from config.env import env

# Node's bcrypt silently ignores everything after the first 72 bytes of a
# password. Python's bcrypt raises an error on longer input, so we cut at 72
# bytes ourselves. This keeps old Node hashes valid and avoids 500 errors.
_MAX_BYTES = 72


def _prepare(plain):
    return plain.encode("utf-8")[:_MAX_BYTES]


def hash_password(plain):
    """bcrypt hash ($2b$12$...), the same format Node created."""
    salt = bcrypt.gensalt(rounds=env.bcrypt_salt_rounds)
    return bcrypt.hashpw(_prepare(plain), salt).decode("ascii")


def verify_password(plain, hashed):
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(_prepare(plain), hashed.encode("utf-8"))
    except ValueError:  # malformed hash in the database
        return False