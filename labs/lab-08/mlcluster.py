#!/usr/bin/env python3
"""
Lab 08 - OSINT x ML: cluster Shodan-style service banners into "campaigns".

THE IDEA
--------
An internet-wide scanner / botnet leaves telltale fingerprints across every
host it controls: the same odd SSH version string, the same self-signed TLS
certificate CN, the same default-credential login prompt, the same unusual
HTTP "Server:" header. If you scrape a pile of service banners off the public
internet (Shodan / Censys style) and *cluster* them, hosts that share a
fingerprint fall into the same group -- and each group is, roughly, one
campaign. Your job is to recover those hidden campaigns from raw banner text.

DATA FILE: mlcluster_banners.json (sits next to this script)
------------------------------------------------------------
A single JSON array of banner records. Each record is an object:

    {
      "id":     <int>     0-based, contiguous, and equal to the record's
                          position in the array. Use it to keep your output
                          aligned with the input -- label[i] describes id i.
      "ip":     <str>     A plausible public IPv4 address, e.g. "203.0.113.5".
                          Cosmetic only; do NOT cluster on the IP itself.
      "port":   <int>     The TCP port the banner was observed on (22, 80,
                          443, 23, 554, ...). A weak hint at best.
      "banner": <str>     The raw service banner text -- this is your signal.
                          May contain "\r\n", auth realms, version strings,
                          cert subjects, login prompts, etc.
    }

The dataset contains a handful of hidden campaigns (assume between 3 and 8)
plus some legitimate, unrelated "noise" services that should not cluster with
anything. The ground-truth campaign labels are NOT in this file -- they live
in the autograder.

I/O CONTRACT
------------
- Read mlcluster_banners.json from the same directory as this script.
- Implement cluster_banners(banners) -> list[int]. It must return one integer
  cluster label per banner, in id order (so the returned list has the same
  length as the dataset, and result[i] is the label for the record whose
  id == i). The actual integer values are arbitrary -- only the *grouping*
  matters (which ids share a label). Noise points may each get their own
  label, or share a "junk" label; the scorer is label-permutation invariant.
- main() prints the labels as ONE clean JSON array to stdout and nothing else,
  e.g.  [0, 0, 3, 1, 0, 2, ...]  -- the autograder parses stdout as JSON.

RUN
---
    python3 mlcluster.py            # prints the JSON label array
    python3 test_mlcluster.py       # spawns this script and grades it

GRADING (see test_mlcluster.py)
-------------------------------
- SCAFFOLD: output parses as JSON, is a list of ints, length == #banners.
- QUALITY : Adjusted Rand Index vs hidden truth >= 0.60.
The shipped stub returns all-zeros: it PASSES scaffold and FAILS quality.
Your task is to make QUALITY pass.
"""

import json
import os
import sys


def load_banners(path=None):
    """Load the banner dataset as a list of dicts, sorted by id."""
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            "mlcluster_banners.json")
    with open(path, "r") as f:
        banners = json.load(f)
    banners.sort(key=lambda r: r["id"])
    return banners


# ===========================================================================
# YOUR JOB starts here.
# ===========================================================================
#
# Implement cluster_banners(). Return a list of integer cluster labels, one
# per banner, in id order. The integer values are arbitrary -- only the
# grouping matters.
#
# Suggested approach (you have scikit-learn):
#   1. Turn each banner["banner"] string into a numeric vector with TF-IDF.
#      Character n-grams (analyzer="char_wb", ngram_range=(3, 5)) tend to beat
#      word tokens here, because the telltale tokens are messy substrings like
#      "dropbear_2019.78" or "CN=hakai" that don't split on whitespace cleanly.
#         from sklearn.feature_extraction.text import TfidfVectorizer
#   2. Cluster the vectors. You may assume between 3 and 8 campaigns.
#      Agglomerative clustering with cosine distance works well, or KMeans.
#         from sklearn.cluster import AgglomerativeClustering, KMeans
#   3. Return the .labels_ as a plain Python list of ints, in id order.
#
# TODO: replace this stub. It returns all-zeros, which passes SCAFFOLD but
# fails QUALITY (every host in one giant cluster recovers no campaign).
def cluster_banners(banners):
    # TODO: build TF-IDF features over [b["banner"] for b in banners],
    #       cluster them, and return the integer labels in id order.
    return [0 for _ in banners]


# ===========================================================================
# YOUR JOB ends here. The harness below is complete -- do not edit it.
# ===========================================================================


def main():
    banners = load_banners()
    labels = cluster_banners(banners)
    labels = [int(x) for x in labels]
    if len(labels) != len(banners):
        sys.stderr.write(
            "cluster_banners returned %d labels for %d banners\n"
            % (len(labels), len(banners)))
        sys.exit(1)
    sys.stdout.write(json.dumps(labels))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
