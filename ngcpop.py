import requests
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed

GROUPS_URL = "https://production.api.aws.ccg-ops.com/api/coins/research/groups/"
POP_URL = "https://production.api.aws.ccg-ops.com/api/coins/research/population"
BULGARIA_SUBCATEGORY_ID = 292


def fetch_json(url):
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


def get_all_group_ids(subcategory_id=BULGARIA_SUBCATEGORY_ID):
    """Fetch all researchGroupIDs from /groups/ (paged)."""
    page, ids = 1, []
    while True:
        url = f"{GROUPS_URL}?researchSubcategoryID={subcategory_id}&page={page}&keywords=&languageID="
        data = fetch_json(url)
        items = data.get("Items", [])
        if not items:
            break
        ids.extend([item["researchGroupID"] for item in items])
        if not data.get("ShowNextPage"):
            break
        page += 1
    return ids


def map_grade(designation: str, grade: int) -> str:
    """Map numeric grade to proper prefix (MS, PF, AU, XF, VF, F, VG, G, AG, FR, PO)."""
    if grade >= 60:
        return f"{designation}{grade}"
    elif grade >= 50:
        return f"AU{grade}"
    elif grade >= 40:
        return f"XF{grade}"
    elif grade >= 20:
        return f"VF{grade}"
    elif grade >= 12:
        return f"F{grade}"
    elif grade >= 8:
        return f"VG{grade}"
    elif grade >= 4:
        return f"G{grade}"
    elif grade == 3:
        return "AG3"
    elif grade == 2:
        return "FR2"
    elif grade == 1:
        return "PO1"
    else:
        return f"{designation}{grade}"  # fallback


# population_66 / population_66Plus / population_66Star / population_66PlusStar
GRADE_KEY_RE = re.compile(r"^population_(\d+)(Plus)?(Star)?$")
# population_UNC_Details, population_AU_Details, ... (details-graded coins)
DETAILS_KEY_RE = re.compile(r"^population_(UNC|AU|XF|VF|F|VG|G|AG|FAIR|POOR)_Details$")
# best-preserved details first; all details sort below every numeric grade
DETAILS_ORDER = ["UNC", "AU", "XF", "VF", "F", "VG", "G", "AG", "FAIR", "POOR"]


def get_image_path(coin, side):
    """Return an obverse/reverse image path when the API provides one."""
    for key, value in coin.items():
        normalized_key = re.sub(r"[^a-z]", "", key.lower())
        if side in normalized_key and any(kind in normalized_key for kind in ("image", "photo")):
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def get_grades_for_group(group_id, designation="PF"):
    """Fetch all pages for a group and return ALL grades with counts for each coin."""
    results, page = [], 1
    while True:
        url = f"{POP_URL}/{designation}/?researchGroupID={group_id}&page={page}&keywords=&populationID="
        data = fetch_json(url)
        items = data.get("Items", [])
        if not items:
            break

        for coin in items:
            display_name = coin.get("displayName", f"Group {group_id}")
            # (label, count, sort score) — score ranks 66+★ > 66+ > 66★ > 66,
            # with details grades below the whole numeric scale
            grade_counts = []
            for key, value in coin.items():
                if not isinstance(value, int) or value <= 0:
                    continue
                m = GRADE_KEY_RE.match(key)
                if m:
                    grade = int(m.group(1))
                    label = map_grade(designation, grade)
                    if m.group(2):
                        label += "+"
                    if m.group(3):
                        label += "★"
                    score = grade * 100 + (50 if m.group(2) else 0) + (10 if m.group(3) else 0)
                    grade_counts.append((label, value, score))
                    continue
                d = DETAILS_KEY_RE.match(key)
                if d:
                    label = f"{d.group(1)} DETAILS"
                    score = -1 - DETAILS_ORDER.index(d.group(1))
                    grade_counts.append((label, value, score))
                # anything else (population_Total, unknown keys) is intentionally skipped
            if grade_counts:
                grade_counts.sort(key=lambda x: x[2], reverse=True)
                results.append({
                    "GroupID": group_id,
                    "Coin Name": display_name,
                    "Designation": designation,
                    "Coin ID": coin.get("coinID"),
                    "Population ID": coin.get("populationID"),
                    "Universal Coin Type ID": coin.get("universalCoinTypeID"),
                    "Sum Number ID": coin.get("sumNumID"),
                    "Year": coin.get("year"),
                    "Numeric Year": coin.get("numericYear"),
                    "Denomination": coin.get("denomination"),
                    "Mint Mark": coin.get("mintMark"),
                    "Strike": coin.get("strike"),
                    "Variety": coin.get("variety"),
                    "Label Code": coin.get("labelCode"),
                    "Is Base Coin": coin.get("isBaseCoin"),
                    "Is Variety Coin": coin.get("isVarietyCoin"),
                    "Is Label Coin": coin.get("isLabelCoin"),
                    "Description": coin.get("description"),
                    "Coin Reference": coin.get("coinReference"),
                    "Krause Number": coin.get("krauseNumber"),
                    "Population Total": coin.get("population_Total"),
                    "Date Modified": coin.get("dateModified"),
                    "Obverse Image": get_image_path(coin, "obverse"),
                    "Reverse Image": get_image_path(coin, "reverse"),
                    "Grades": [{"Grade": g, "Count": c} for g, c, _ in grade_counts]
                })

        if not data.get("ShowNextPage"):
            break
        page += 1
    return results


def main():
    group_ids = get_all_group_ids()
    print(f"Found {len(group_ids)} group IDs")

    all_rows = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {}
        for gid in group_ids:
            futures[executor.submit(get_grades_for_group, gid, "PF")] = (gid, "PF")
            futures[executor.submit(get_grades_for_group, gid, "MS")] = (gid, "MS")

        for i, future in enumerate(as_completed(futures), start=1):
            gid, des = futures[future]
            try:
                coin_results = future.result()
                print(f"[{i}/{len(futures)}] Done group {gid} ({des}, {len(coin_results)} coins)")
                all_rows.extend(coin_results)
            except Exception as e:
                print(f"❌ Error fetching {gid} ({des}): {e}")

    # Write JSON (this file will be committed to the repo by GitHub Actions)
    with open("ngc_population.json", "w", encoding="utf-8") as f:
        json.dump(all_rows, f, indent=2, ensure_ascii=False)

    print(f"✅ Saved ngc_population.json with {len(all_rows)} rows")


if __name__ == "__main__":
    main()
