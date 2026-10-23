from service import process, batch
from callbacks import invoke

def main():
    first = process('10')
    print(first)
    second = batch([1, 2])
    return invoke(first)
