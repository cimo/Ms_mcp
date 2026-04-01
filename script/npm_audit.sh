#!/bin/bash

if [ -z "${1}" ]
then
  echo "❌ Error: specify project path!"
  
  exit 1
fi

parameter1="${1}"

cd "${parameter1}"

echo -e "\nProject: ${parameter1}"

echo -e "\n1. Npm outdated:"

npm outdated || true

echo -e "\n2. Npm audit --json:"

if [ -f "package-lock.json" ]
then
    echo -e "\nFile 'package.lock.json' found, clean source and reinstall the package.\n"

    rm -rf "node_modules/" "package-lock.json"

    npm install --no-audit
else
    echo -e "\nFile 'package.lock.json' not found, install the package.\n"

    npm install --no-audit
fi

auditJson="$(mktemp)"

cleanup() {
    rm -f "${auditJson}"
}
trap cleanup EXIT

npm audit --json --audit-level="low" > "${auditJson}" || true

node - "${auditJson}" <<'NODE'
const fs = require("fs");

const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));

const metadata = data.metadata || {};
const vulnarability = metadata.vulnerabilities || {};
const totalDependency = metadata.dependencies.total ?? "n/d";

console.log("\nSummary:");
console.log(`Total dependency: ${totalDependency}`);
console.log(`Info: ${vulnarability.info ?? 0}`);
console.log(`Low: ${vulnarability.low ?? 0}`);
console.log(`Moderate: ${vulnarability.moderate ?? 0}`);
console.log(`High: ${vulnarability.high ?? 0}`);
console.log(`Critical: ${vulnarability.critical ?? 0}`);

const vulnarabilityObject = data.vulnerabilities || {};
const entryList = Object.entries(vulnarabilityObject);

if (entryList.length === 0) {
    console.log("\nNo vulnerabilities found.");
    
    process.exit(0);
}

console.log("\nVulnerability details:");

for (const [key, value] of entryList) {
    const severity = value.severity || "unknown";
    const direct = value.isDirect ? "Direct" : "Transitive";
    const range = value.range || "n/d";

    let fix = "Not available";

    if (value.fixAvailable === true) {
        fix = "Available (version unknown).";
    }

    if (value.fixAvailable && typeof value.fixAvailable === "object") {
        fix = `${value.fixAvailable.name || key}@${value.fixAvailable.version || "latest"}`;
    }

    let causeList = [];

    if (Array.isArray(value.via)) {
        for (const valueVia of value.via) {
            if (typeof valueVia === "string") {
                causeList.push(valueVia);
            } else {
                causeList.push(`${valueVia.source || "advisory"}:${valueVia.title || "n/d"}`);
            }
        }
    }

    console.log(`\n- ${key}`);
    console.log(`   Severity: ${severity}`);
    console.log(`   Type: ${direct}`);
    console.log(`   Range inpact: ${range}`);
    console.log(`   Fix: ${fix}`);

    if (causeList.length > 0) {
        console.log(`   Cause: ${causeList.join(" | ")}`);
    }
}

const fixableList = entryList.filter(([, value]) => !!value.fixAvailable);

console.log(`\nPackage with available fix: ${fixableList.length}/${entryList.length}`);

if (fixableList.length > 0) {
    console.log("\nList:");

    for (const [key, value] of fixableList) {
        if (value.fixAvailable && typeof value.fixAvailable === "object") {
            console.log(`- ${key} -> ${value.fixAvailable.name || key}@${value.fixAvailable.version || "latest"}`);
        } else {
            console.log(`- ${key} -> npm audit fix --force`);
        }
    }
}
NODE

echo -e "\nScan completed.\n"
