import os
from dotenv import load_dotenv

load_dotenv(verbose=True)

DEEPL_AUTH_KEY = os.getenv('DEEPL_AUTH_KEY')

print(f'DEEPL_AUTH_KEY: {DEEPL_AUTH_KEY}')