import csv, sys
# AI-migrated from COBOL. BUG (seeded): float arithmetic + banker's rounding,
# whereas the COBOL oracle uses fixed-decimal round-half-away-from-zero.
def run(inp, outp):
    with open(inp) as f, open(outp, "w", newline="") as g:
        r = csv.reader(f); w = csv.writer(g)
        next(r, None)  # header
        w.writerow(["seq", "final_amount", "net_pay"])
        for row in r:
            if not row: continue
            seq, principal, rate, term, gross, tax_rate = row
            principal, rate, term = float(principal), float(rate), int(term)
            gross, tax_rate = float(gross), float(tax_rate)
            final = principal
            for _ in range(term):
                final = round(final * (1 + rate), 2)   # <-- banker's rounding on float
            tax = round(gross * tax_rate, 2)
            net = round(gross - tax, 2)
            w.writerow([seq, f"{final:.2f}", f"{net:.2f}"])
if __name__ == "__main__":
    run(sys.argv[1], sys.argv[2])
