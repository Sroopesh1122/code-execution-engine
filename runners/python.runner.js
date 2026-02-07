const fs = require("fs/promises");
const { execFileSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

module.exports = async (studentCode, visibleTests, hiddenTests, options = {}) => {
  const {
    timeout = 5000,
    pythonPath = "python3",
    ignoreTrailingWhitespace = true,
    collapseMultipleSpaces = true,
    normalizeNewlines = true,
    floatingPointTolerance = null, // { relative: 1e-6, absolute: 1e-9 } or null
  } = options;

  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // ────────────────────────────────────────────────
  //  Safe output normalization (Judge0-inspired)
  // ────────────────────────────────────────────────
  function normalizeOutput(output) {
    // Force to string safely
    let text = "";
    if (output != null) {
      if (typeof output === "string") {
        text = output;
      } else if (Buffer.isBuffer(output)) {
        text = output.toString("utf-8");
      } else {
        text = String(output);
      }
    }

    if (!text.trim()) return "";

    let normalized = text.trim();

    if (normalizeNewlines) {
      normalized = normalized.replace(/\r\n/g, "\n");
    }

    if (collapseMultipleSpaces) {
      normalized = normalized.replace(/\s+/g, " ");
    }

    if (ignoreTrailingWhitespace) {
      normalized = normalized.replace(/[ \t]+$/gm, "");
    }

    return normalized;
  }

  function tokenize(text) {
    return normalizeOutput(text)
      .split(/\s+/)
      .filter(Boolean);
  }

  function outputsMatch(actualStdout, expectedOutput) {
    try {
      const aTokens = tokenize(actualStdout);
      const eTokens = tokenize(expectedOutput);

      if (aTokens.length !== eTokens.length) return false;

      for (let i = 0; i < aTokens.length; i++) {
        if (aTokens[i] !== eTokens[i]) return false;
      }

      return true;
    } catch (err) {
      console.error("Output comparison failed:", err);
      return false;
    }
  }

  // ────────────────────────────────────────────────
  //  Run one test case
  // ────────────────────────────────────────────────
  async function runTest(inputStr, expectedOutputStr, isVisible = false) {
    const tempDir = await fs.mkdtemp(path.join("/tmp", "judge-like-"));
    const codePath = path.join(tempDir, "student.py");
    const wrapperPath = path.join(tempDir, "run.py");

    try {
      const wrapper = `
import sys

# ─── Student code ───────────────────────────────────────
${studentCode}

# ─── Runner ─────────────────────────────────────────────
try:
    input_data = sys.stdin.read().rstrip('\\n')
    if 'solution' in globals() and callable(solution):
        result = solution(input_data)
        if result is not None:
            if isinstance(result, (list, dict, tuple)):
                print(str(result))
            else:
                print(result)
    # If no solution() function → assume classic script style
except Exception as e:
    print("RUNTIME_ERROR:", str(e), file=sys.stderr)
    sys.exit(1)
`;

      await fs.writeFile(codePath, studentCode);
      await fs.writeFile(wrapperPath, wrapper);

      const child = execFileSync(
        pythonPath,
        [wrapperPath],
        {
          input: String(inputStr) + "\n",
          timeout,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 1024 * 1024 * 10, // 10 MB
        }
      );

      let stdout = child.stdout || "";
      let stderr = child.stderr || "";

      // Clean up possible prefix from wrapper
      stderr = stderr.replace(/^RUNTIME_ERROR:\s*/i, "");

      const passed = outputsMatch(stdout, expectedOutputStr);

      let verdict = "Wrong Answer";
      if (passed) {
        verdict = "Accepted";
      } else if (stderr.includes("RUNTIME_ERROR") || stderr.trim()) {
        verdict = "Runtime Error";
      }

      return {
        input: inputStr,
        expected: expectedOutputStr,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        passed,
        verdict,
        time: "N/A (sync)",
      };
    } catch (err) {
      let verdict = "Runtime Error";
      let stderrContent = err.stderr || err.message || "";

      if (err.code === "ERR_CHILD_PROCESS_TIMEOUT" || err.status === 124) {
        verdict = "Time Limit Exceeded";
      }

      return {
        input: inputStr,
        expected: expectedOutputStr,
        stdout: "",
        stderr: stderrContent.trim(),
        passed: false,
        verdict,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  // ────────────────────────────────────────────────
  //  Syntax / Compilation check
  // ────────────────────────────────────────────────
  let compilationError = null;
  try {
    const tempCheck = path.join("/tmp", `check_${uuidv4()}.py`);
    await fs.writeFile(tempCheck, studentCode);
    execFileSync(pythonPath, ["-m", "py_compile", tempCheck], { timeout: 3000 });
    await fs.unlink(tempCheck).catch(() => {});
  } catch (err) {
    compilationError = err.message.includes("SyntaxError")
      ? "Syntax Error"
      : err.message || "Compilation failed";
    return {
      compilationError,
      results: null,
      summary: {
        passed: 0,
        total: 0,
        percentage: "0.0%",
        verdicts: { compilation_error: 1 }
      }
    };
  }

  // ────────────────────────────────────────────────
  //  Execute visible + hidden tests
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

  // Count verdict types
  const allResults = [...results.visible, ...results.hidden];
  const verdictCounts = {
    accepted: allResults.filter(r => r.verdict === "Accepted").length,
    wrong_answer: allResults.filter(r => r.verdict === "Wrong Answer").length,
    runtime_error: allResults.filter(r => r.verdict === "Runtime Error").length,
    time_limit_exceeded: allResults.filter(r => r.verdict === "Time Limit Exceeded").length,
  };

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
      percentage: total > 0 ? ((passed / total) * 100).toFixed(1) + "%" : "0.0%",
      verdicts: verdictCounts
    }
  };
};