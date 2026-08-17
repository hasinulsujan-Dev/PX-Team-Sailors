require "webrick"
require "rbconfig"

ROOT = File.expand_path("..", __dir__)
DOCS = File.join(ROOT, "Docs")
GENERATOR = File.join(ROOT, "scripts", "generate_data.rb")
DATA_FILE = File.join(ROOT, "dashboard", "data", "sailor-report.js")
PORT = (ENV["PORT"] || 8000).to_i

$stdout.sync = true

$docs_sig = ""

def docs_mtime
  Dir[File.join(DOCS, "*.csv")].map { |f| File.mtime(f) }.max || Time.at(0)
end

def docs_signature
  Dir[File.join(DOCS, "*.csv")].map { |f| "#{File.basename(f)}:#{File.mtime(f).to_f}" }.sort.join("|")
end

def regenerate_if_needed
  sig = docs_signature
  stale = !File.exist?(DATA_FILE) || File.mtime(DATA_FILE) < docs_mtime
  if sig != $docs_sig || stale
    puts "[serve] Docs folder changed - regenerating data..."
    system(RbConfig.ruby, GENERATOR) or warn "[serve] regeneration failed"
    $docs_sig = sig
  end
end

server = WEBrick::HTTPServer.new(
  Port: PORT,
  BindAddress: "127.0.0.1",
  DocumentRoot: ROOT
)

server.mount_proc("/dashboard/data/sailor-report.js") do |_req, res|
  regenerate_if_needed
  res.status = 200
  res["Content-Type"] = "application/javascript"
  res.body = File.read(DATA_FILE)
end

trap("INT") { server.shutdown }
trap("TERM") { server.shutdown }

puts "Sailor's Report dashboard: http://127.0.0.1:#{PORT}/dashboard/"
puts "Watching Docs/ for new CSV files. Add a file, then refresh the dashboard."
server.start