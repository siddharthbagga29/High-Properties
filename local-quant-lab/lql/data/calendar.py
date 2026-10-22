"""US equity exchange (NYSE / XNYS) session calendar, rule-based, for data-quality checks.

Full-day closures only (early closes are still sessions). Rules: New Year's Day (Sunday -> Monday; a Saturday holiday
is not moved to Friday), Martin Luther King Jr. Day (3rd Monday of January), Washington's Birthday (3rd Monday of
February), Good Friday, Memorial Day (last Monday of May), Juneteenth (from 2022; Saturday -> Friday, Sunday -> Monday),
Independence Day and Christmas (Saturday -> Friday, Sunday -> Monday), Labor Day (1st Monday of September),
Thanksgiving (4th Thursday of November), plus the unscheduled closures listed in SPECIAL since 2000.
Reliable for 2000 onward; before 2000 only the rules apply. Check a new year against the exchange's published holiday
list before trusting it for evidence."""
from datetime import date, timedelta

SPECIAL = {date(2001, 9, 11): "September 11 attacks", date(2001, 9, 12): "September 11 attacks",
           date(2001, 9, 13): "September 11 attacks", date(2001, 9, 14): "September 11 attacks",
           date(2004, 6, 11): "national day of mourning (Reagan)", date(2007, 1, 2): "national day of mourning (Ford)",
           date(2012, 10, 29): "Hurricane Sandy", date(2012, 10, 30): "Hurricane Sandy",
           date(2018, 12, 5): "national day of mourning (G.H.W. Bush)", date(2025, 1, 9): "national day of mourning (Carter)"}


def _nth_weekday(y, m, weekday, n):
    d = date(y, m, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def _last_weekday(y, m, weekday):
    d = date(y, m + 1, 1) - timedelta(days=1) if m < 12 else date(y, 12, 31)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def easter(y):
    """Gregorian Easter Sunday (anonymous Gregorian algorithm)."""
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    return date(y, month, (h + l_ - 7 * m + 114) % 31 + 1)


def _observed(d, saturday_to_friday=True):
    if d.weekday() == 6:
        return d + timedelta(days=1)
    if d.weekday() == 5:
        return d - timedelta(days=1) if saturday_to_friday else None
    return d


def holidays(y):
    """{date: name} of full-day closures in year y."""
    out = {}
    nyd = _observed(date(y, 1, 1), saturday_to_friday=False)
    if nyd:
        out[nyd] = "New Year's Day"
    out[_nth_weekday(y, 1, 0, 3)] = "Martin Luther King Jr. Day"
    out[_nth_weekday(y, 2, 0, 3)] = "Washington's Birthday"
    out[easter(y) - timedelta(days=2)] = "Good Friday"
    out[_last_weekday(y, 5, 0)] = "Memorial Day"
    if y >= 2022:
        out[_observed(date(y, 6, 19))] = "Juneteenth"
    out[_observed(date(y, 7, 4))] = "Independence Day"
    out[_nth_weekday(y, 9, 0, 1)] = "Labor Day"
    out[_nth_weekday(y, 11, 3, 4)] = "Thanksgiving"
    out[_observed(date(y, 12, 25))] = "Christmas"
    out.update({d: n for d, n in SPECIAL.items() if d.year == y})
    return out


def is_session(d):
    return d.weekday() < 5 and d not in holidays(d.year)


def sessions(start, end):
    """Every XNYS session date in [start, end]."""
    out, d, hol = [], start, {}
    while d <= end:
        if d.year not in hol:
            hol[d.year] = holidays(d.year)
        if d.weekday() < 5 and d not in hol[d.year]:
            out.append(d)
        d += timedelta(days=1)
    return out
