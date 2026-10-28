// Purpose: Checks that the generated ABI in index.ts, which the API and web app use, matches the compiled contract
// Notes:
// - A contract change without the matching index.ts edit fails here instead of in the listener or the web app
// - Reads compiled artifacts only, so it needs no Hardhat node or accounts

import test from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { RefferalABI } from "../index.ts";

// Sorted keys, so the comparison ignores the order properties are written in
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, canonical(value[key])]),
        );
    }
    return value;
}

function entriesByKey(abi) {
    return new Map(
        abi.map((entry) => [
            `${entry.type} ${entry.name ?? ""}(${(entry.inputs ?? []).map((input) => input.type).join(",")})`,
            JSON.stringify(canonical(entry)),
        ]),
    );
}

test("index.ts exports exactly the compiled ReferralProgram ABI", async () => {
    const compiled = entriesByKey((await hre.artifacts.readArtifact("ReferralProgram")).abi);
    const shared = entriesByKey(RefferalABI);

    assert.deepEqual([...shared.keys()].sort(), [...compiled.keys()].sort());
    for (const [key, entry] of compiled) {
        assert.equal(shared.get(key), entry, `${key} in index.ts differs from the compiled contract`);
    }
});
