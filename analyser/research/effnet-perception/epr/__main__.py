"""python -m epr <step> — see README.md for the order."""
import argparse
import sys


def main(argv=None):
    ap = argparse.ArgumentParser(prog='epr')
    ap.add_argument('step', choices=['snapshot', 'sample', 'embed-full', 'representations', 'style', 'stems', 'changes',
                                     'swaps', 'offsets', 'correlations', 'report', 'page'])
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--limit', type=int, default=None, help='only the first N items (trial runs)')
    a = ap.parse_args(argv)

    if a.step == 'snapshot':
        from .catalog import take_snapshot
        print(take_snapshot())
        return 0
    if a.step == 'sample':
        from . import catalog, sample
        sample.run(catalog.connect())
        return 0
    if a.step == 'embed-full':
        from . import fullembed
        return fullembed.run(workers=a.workers)
    if a.step == 'representations':
        from . import representations
        return representations.run(workers=a.workers)
    if a.step == 'style':
        from . import style
        return style.run(workers=a.workers)
    if a.step == 'stems':
        from . import stems
        return stems.run(limit=a.limit)
    if a.step == 'changes':
        from . import changes
        return changes.run(workers=a.workers, limit=a.limit)
    if a.step == 'swaps':
        from . import swaps
        return swaps.run(workers=a.workers, limit=a.limit)
    if a.step == 'offsets':
        from . import offsets
        return offsets.run(workers=a.workers, limit=a.limit)
    if a.step == 'correlations':
        from . import correlations
        return correlations.run()
    if a.step == 'report':
        from . import report
        return report.run()
    if a.step == 'page':
        from . import page
        return page.run()
    return 2


if __name__ == '__main__':
    sys.exit(main())
