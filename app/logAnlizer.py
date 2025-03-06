import re
from datetime import datetime

# Path to logs
ACCESS_LOG_PATH = "logs/access.log"
ERROR_LOG_PATH = "logs/error.log"

# Get today's date in Apache log format
today = datetime.now().strftime("%d/%b/%Y")

def parse_access_log():
    try:
        with open(ACCESS_LOG_PATH, 'r') as file:
            lines = file.readlines()
    except FileNotFoundError:
        print("Error: " + ACCESS_LOG_PATH + " not found")
        return 0, {}, {}, {}

    total_hits = 0
    status_codes = {}
    top_pages = {}
    visitor_ips = {}

    for line in lines:
        if today in line:
            total_hits += 1

            # Extract status codes
            match = re.search(r' (\d{3}) ', line)
            if match:
                status_code = match.group(1)
                status_codes[status_code] = status_codes.get(status_code, 0) + 1

            # Extract requested page
            page_match = re.search(r'"[A-Z]+ (.*?) HTTP/', line)
            if page_match:
                page = page_match.group(1)
                top_pages[page] = top_pages.get(page, 0) + 1

            # Extract visitor IP
            ip_match = re.match(r'(\d+\.\d+\.\d+\.\d+)', line)
            if ip_match:
                ip = ip_match.group(1)
                visitor_ips[ip] = visitor_ips.get(ip, 0) + 1

    return total_hits, status_codes, top_pages, visitor_ips

def parse_error_log():
    try:
        with open(ERROR_LOG_PATH, 'r') as file:
            lines = file.readlines()
    except FileNotFoundError:
        print("Error: " + ERROR_LOG_PATH + " not found")
        return 0, {}

    error_count = 0
    error_messages = {}

    for line in lines:
        if today in line:
            error_count += 1
            error_type_match = re.search(r'\[(error|warn|crit)\]', line, re.IGNORECASE)
            if error_type_match:
                error_type = error_type_match.group(1).upper()
                error_messages[error_type] = error_messages.get(error_type, 0) + 1

    return error_count, error_messages

def generate_report():
    total_hits, status_codes, top_pages, visitor_ips = parse_access_log()
    error_count, error_messages = parse_error_log()

    report = """
    Apache Daily Log Report - {0}

    === Access Log Summary ===
    Total Hits: {1}
    Status Code Breakdown: {2}
    Top Requested Pages: {3}
    Top Visitor IPs: {4}

    === Error Log Summary ===
    Total Errors: {5}
    Error Types: {6}

    Regards,
    Automated Server Logs
    """.format(today, total_hits, status_codes, 
                sorted(top_pages.items(), key=lambda x: x[1], reverse=True)[:5],
                sorted(visitor_ips.items(), key=lambda x: x[1], reverse=True)[:5],
                error_count, error_messages)

    return report

if __name__ == "__main__":
    report_content = generate_report()
    
    # Save the report to a file
    report_file = "logs/daily_report_" + datetime.now().strftime('%Y-%m-%d') + ".txt"
    with open(report_file, "w") as file:
        file.write(report_content)

    print("Report generated and saved to " + report_file)
