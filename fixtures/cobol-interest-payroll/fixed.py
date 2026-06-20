import csv, sys
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal('0.01')

def run(inp, outp):
    with open(inp) as f, open(outp, "w", newline="") as g:
        r = csv.reader(f); w = csv.writer(g)
        next(r, None)  # header
        w.writerow(["seq", "final_amount", "net_pay"])
        for row in r:
            if not row: continue
            seq, principal, rate, term, gross, tax_rate = row
            principal = Decimal(principal)
            rate = Decimal(rate)
            term = int(term)
            gross = Decimal(gross)
            tax_rate = Decimal(tax_rate)
            final = principal
            for _ in range(term):
                final = (final * (1 + rate)).quantize(CENT, rounding=ROUND_HALF_UP)
            tax = (gross * tax_rate).quantize(CENT, rounding=ROUND_HALF_UP)
            net = gross - tax
            w.writerow([seq, f"{final:.2f}", f"{net:.2f}"])

if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
