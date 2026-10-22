def adjusted(value):
    if value < 0:
        raise ValueError('negative')
    return value * 0.9 if value >= 100 else value

def valid(value):
    return isinstance(value, (int, float))
