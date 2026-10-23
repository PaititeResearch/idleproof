def inner(value):
    return value

def make():
    def selected(value):
        return inner(value)
    return selected

def use(callback, value):
    return callback(value)

def invoke(value):
    return make()(value)
