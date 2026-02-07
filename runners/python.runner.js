const fs = require("fs/promises"); // prefer async
const { execFileSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

module.exports = async (studentCode, visibleTests, hiddenTests, options = {}) => {
  const {
    timeout = 5000,           // increased default
    pythonPath = "python3",
    // New options — Judge0-like
    ignoreTrailingWhitespace = true,
    collapseMultipleSpaces = true,
    normalizeNewlines = true,
    floatingPointTolerance = null, // { relative: 1e-6, absolute: 1e-9 } or null
  } = options;

  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // ────────────────────────────────────────────────
  //  Judge0-like token-based comparison
  // ────────────────────────────────────────────────
  function normalizeOutput(text) {
    if (!text) return "";

    let normalized = text.trim();

    if (normalizeNewlines) {
      normalized = normalized.replace(/\r\n/g, "\n");
    }

    if (collapseMultipleSpaces) {
      normalized = normalized.replace(/\s+/g, " ");
    }

    if (ignoreTrailingWhitespace) {
      normalized = normalized.replace(/[ \t]+$/gm, ""); // per line
    }

    return normalized;
  }

  function tokenize(text) {
    // Very simple Judge0-inspired tokenizer:
    // split on whitespace, keep non-empty tokens
    return normalizeOutput(text)
      .split(/\s+/)
      .filter(Boolean);
  }

  function outputsMatch(actualStdout, expected) {
    if (floatingPointTolerance) {
      // Future: implement approximate float comparison per token
      // For now — fallback to token match
    }

    const aTokens = tokenize(actualStdout);
    const eTokens = tokenize(expected);

    if (aTokens.length !== eTokens.length) return false;

    for (let i = 0; i < aTokens.length; i++) {
      if (aTokens[i] !== eTokens[i]) return false;
    }

    return true;
  }

  // ────────────────────────────────────────────────
  //  Run one test case — Judge0 style (stdin → stdout)
  // ────────────────────────────────────────────────
  async function runTest(inputStr, expectedOutputStr, isVisible = false) {
    const tempDir = await fs.mkdtemp(path.join("/tmp", "judge-like-"));
    const codePath = path.join(tempDir, "student.py");
    const wrapperPath = path.join(tempDir, "run.py");

    try {
      // Student code + simple runner that feeds stdin and captures print()
      const wrapper = `
import sys
import json

# ─── Student code ───────────────────────────────────────
${studentCode}

# ─── Runner ─────────────────────────────────────────────
try:
    input_data = sys.stdin.read().rstrip('\\n')
    # If student defined solution(), call it with raw input
    if 'solution' in globals():
        result = solution(input_data)
        if result is not None:
            print(result)
    else:
        # Otherwise just exec the whole code (classic script style)
        pass  # already executed

except Exception as e:
    print("Runtime Error:", str(e), file=sys.stderr)
    sys.exit(1)
`;

      await fs.writeFile(codePath, studentCode);       // for syntax check later
      await fs.writeFile(wrapperPath, wrapper);

      // Execute
      const child = execFileSync(
        pythonPath,
        [wrapperPath],
        {
          input: inputStr + "\n",           // Judge0-like: raw string + newline
          timeout,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 1024 * 1024 * 5,       // 5 MB limit
        }
      );

      const stdout = child.stdout || "";
      const stderr = child.stderr || "";

      const passed = outputsMatch(stdout, expectedOutputStr);

      return {
        input: inputStr,
        expected: expectedOutputStr,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        passed,
        verdict: passed          ? "Accepted" :
                 stderr.includes("Error") ? "Runtime Error" :
                 "Wrong Answer",
        time: "N/A (sync exec)", // can measure if needed
      };

    } catch (err) {
      let verdict = "Runtime Error";
      let message = err.message;

      if (err.status === 124) verdict = "Time Limit Exceeded"; // timeout
      if (err.code === "ERR_CHILD_PROCESS_TIMEOUT") verdict = "Time Limit Exceeded";

      return {
        input: inputStr,
        expected: expectedOutputStr,
        stdout: "",
        stderr: err.stderr || message,
        passed: false,
        verdict,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  // ────────────────────────────────────────────────
  //  Syntax check (keep similar)
  // ────────────────────────────────────────────────
  try {
    const tempCheck = path.join("/tmp", `check_${uuidv4()}.py`);
    await fs.writeFile(tempCheck, studentCode);
    execFileSync(pythonPath, ["-m", "py_compile", tempCheck], { timeout: 2000 });
    await fs.unlink(tempCheck);
  } catch (err) {
    return {
      compilationError: err.message.includes("SyntaxError") ? "Syntax Error" : err.message,
      results: null,
      summary: { passed: 0, total: 0, percentage: "0%" }
    };
  }

  // ────────────────────────────────────────────────
  //  Run tests
  // ────────────────────────────────────────────────
  for (const t of visibleTests) {
    const r = await runTest(t.input, t.output, true);
    if (r.passed) passedVisible++;
    results.visible.push(r);
  }

  for (const t of hiddenTests) {
    const r = await runTest(t.input, t.output, false);
    if (r.passed) passedHidden++;
    results.hidden.push(r);
  }

  const total = visibleTests.length + hiddenTests.length;
  const passed = passedVisible + passedHidden;

  return {
    compilationError: null,
    results,
    summary: {
      passedVisible,
      passedHidden,
      totalVisible: visibleTests.length,
      totalHidden: hiddenTests.length,
      passed,
      total,
      percentage: total > 0 ? ((passed / total) * 100).toFixed(1) + "%" : "0%",
      verdicts: {
        accepted: passed,
        wrong_answer: total - passed,
        // can count TLE, RE, etc. from results
      }
    }
  };
};