require "csv"
require "json"
require "date"
require "fileutils"

DOCS_DIR = File.expand_path("../Docs", __dir__)
OUT_DIR = File.expand_path("../dashboard/data", __dir__)
OUT_FILE = File.join(OUT_DIR, "sailor-report.js")

MONTH_NAMES = {
  "Jan" => "January", "Feb" => "February", "Mar" => "March", "Apr" => "April",
  "May" => "May", "Jun" => "June", "Jul" => "July", "Aug" => "August",
  "Sep" => "September", "Oct" => "October", "Nov" => "November", "Dec" => "December"
}.freeze

MONTH_ORDER = MONTH_NAMES.keys.freeze

ENTRY_RE = /\A(.*?)\s*-\s*(\d+(?:\.\d+)?%?|\d{1,2}:\d{2}:\d{2})\s*\z/
URL_RE = /\Ahttps?:\/\//i
SUBJECT_RE = /\A(?:Mail|Email) Subject:\s*(.+)\z/i

def parse_entries(cells)
  entries = []
  sheet = nil
  mail_subject = nil

  cells.each_with_index do |cell, idx|
    text = cell.to_s.strip
    next if text.empty?
    is_last = idx == cells.length - 1

    if text =~ URL_RE
      sheet = text
    elsif (m = text.match(SUBJECT_RE))
      mail_subject = m[1].strip
    elsif is_last
      sheet = text
    elsif (m = text.match(ENTRY_RE))
      name = m[1].strip
      value = m[2].strip
      type =
        if value =~ /:/
          "time"
        elsif value =~ /%/
          "percent"
        else
          "count"
        end
      num =
        case type
        when "time"
          parts = value.split(":").map(&:to_f)
          (parts[0] + parts[1] / 60.0 + parts[2].to_f / 3600.0).round(2)
        when "percent"
          value.delete("%").to_f.round(2)
        else
          value.to_i
        end
      entries << { name: name, value: value, type: type, num: num }
    else
      entries << { name: text, type: "text" }
    end
  end

  [entries, sheet, mail_subject]
end

def header_row?(row)
  first = row[0].to_s.strip
  second = row[1].to_s.strip
  return true if first == "Name" && row[1..].all? { |c| c.to_s.strip.empty? }
  return true if first == "Criteria" && row[1..].all? { |c| c.to_s.strip.empty? }
  return true if first.empty? && second == "Resposibility"
  return true if row.all? { |c| c.to_s.strip.empty? }

  false
end

def month_from_filename(filename)
  m = filename.match(/- (\w{3})-(\d{4})\.csv\z/)
  return nil unless m
  abbrev = m[1]
  year = m[2].to_i
  return nil unless MONTH_NAMES.key?(abbrev)
  [abbrev, year, "#{MONTH_NAMES[abbrev]} #{year}"]
end

def process_file(path)
  rows = CSV.parse(File.read(path, encoding: "UTF-8"))
  criteria_list = []
  current = nil

  rows.each do |row|
    next if header_row?(row)

    first = row[0].to_s.strip

    if first.empty?
      if current
        entries, sheet, subject = parse_entries(row[1..])
        current[:entries].concat(entries)
        current[:sheet] ||= sheet
        current[:mail_subject] ||= subject
      end
    else
      current = { name: first, responsibility: row[1].to_s.strip, entries: [], sheet: nil, mail_subject: nil }
      entries, sheet, subject = parse_entries(row[2..])
      current[:entries] = entries
      current[:sheet] = sheet
      current[:mail_subject] = subject
      criteria_list << current
    end
  end

  criteria_list
end

files = Dir[File.join(DOCS_DIR, "*.csv")].sort

months = files.map do |path|
  info = month_from_filename(File.basename(path))
  unless info
    warn "Skipping unrecognized file (expected 'Sailor's Report-YYYY - Mon-YYYY.csv'): #{File.basename(path)}"
    next
  end
  abbrev, year, label = info
  {
    key: "#{abbrev}-#{year}",
    label: label,
    order: year * 12 + (MONTH_ORDER.index(abbrev) || 0),
    criteria: process_file(path)
  }
end.compact.sort_by { |m| [m[:order], m[:key]] }

seen = Hash.new(0)
months.each { |m| seen[m[:key]] += 1 }
seen.select { |_, n| n > 1 }.each do |key, n|
  warn "Warning: #{n} CSV files found for #{key}; only the first is used."
end

data = {
  generated: Date.today.to_s,
  months: months.map do |m|
    {
      key: m[:key],
      label: m[:label],
      criteria: m[:criteria].map do |c|
        {
          name: c[:name],
          responsibility: c[:responsibility],
          sheet: c[:sheet],
          mail_subject: c[:mail_subject],
          entries: c[:entries]
        }
      end
    }
  end
}

FileUtils.mkdir_p(OUT_DIR)
File.write(OUT_FILE, "window.SAILOR_REPORT_DATA = #{JSON.pretty_generate(data)};\n")
puts "Wrote #{OUT_FILE}"
puts "Months: #{data[:months].map { |m| m[:label] }.join(', ')}"