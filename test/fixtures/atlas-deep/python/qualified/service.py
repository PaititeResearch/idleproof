from rules import adjusted as tune, valid

def normalize(value):
    return float(value)

def process(raw):
    value = normalize(raw)
    if not valid(value):
        raise ValueError('invalid')
    return tune(value)

def batch(values):
    return [process(value) for value in values]
