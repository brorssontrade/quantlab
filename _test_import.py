import sys
sys.path.insert(0, '.')
try:
    import app.main
    print('OK')
except Exception as e:
    import traceback
    traceback.print_exc()
