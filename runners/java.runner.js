const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");

module.exports = async (studentCode, visibleTests, hiddenTests, options = {}) => {
  const {
    timeout = 3000,
    compileTimeout = 5000
  } = options;

  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // Helper to convert any input to JSON string for Java
  const toJavaInput = (input) => {
    return JSON.stringify(input);
  };

  // Helper to parse Java output (could be JSON or plain string)
  const parseJavaOutput = (output) => {
    if (!output) return null;
    
    // Clean up any extra whitespace or error prefixes
    const trimmed = output.trim();
    
    // Check if it's a JSON array/object
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // If JSON parsing fails, return as string
        return trimmed;
      }
    }
    
    // Try to parse as number
    if (!isNaN(trimmed) && trimmed !== '') {
      const num = Number(trimmed);
      if (!isNaN(num)) return num;
    }
    
    // Return as string
    return trimmed;
  };

  // 1️⃣ Create temporary directory
  const tempDir = `/tmp/java_${uuidv4()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  // 2️⃣ Extract class name from student code
  const classNameMatch = studentCode.match(/class\s+(\w+)/);
  const className = classNameMatch ? classNameMatch[1] : 'Solution';
  
  // 3️⃣ Write student's Java file
  const studentFilePath = path.join(tempDir, `${className}.java`);
  fs.writeFileSync(studentFilePath, studentCode);

  // 4️⃣ Create smart Main.java wrapper that handles ANY input/output
  const mainFilePath = path.join(tempDir, "Main.java");
  const mainCode = `
import java.util.*;
import java.lang.reflect.*;
import org.json.*;

public class Main {
    public static void main(String[] args) {
        try {
            Scanner scanner = new Scanner(System.in);
            String inputJson = scanner.nextLine();
            scanner.close();
            
            // Parse JSON input
            Object input = parseInput(inputJson);
            
            // Find and call solution method
            Object result = callSolutionMethod(input);
            
            // Output result
            outputResult(result);
            
        } catch (Exception e) {
            System.out.println("ERROR: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    private static Object parseInput(String json) throws Exception {
        if (json.trim().startsWith("[")) {
            // Parse as JSONArray
            JSONArray arr = new JSONArray(json);
            return jsonArrayToList(arr);
        } else if (json.trim().startsWith("{")) {
            // Parse as JSONObject
            JSONObject obj = new JSONObject(json);
            return jsonObjectToMap(obj);
        } else {
            // Try as primitive
            return parsePrimitive(json.trim());
        }
    }
    
    private static Object parsePrimitive(String str) {
        try {
            // Try integer
            return Integer.parseInt(str);
        } catch (Exception e1) {
            try {
                // Try double
                return Double.parseDouble(str);
            } catch (Exception e2) {
                // Try boolean
                if (str.equalsIgnoreCase("true")) return true;
                if (str.equalsIgnoreCase("false")) return false;
                
                // Return as string
                return str;
            }
        }
    }
    
    private static List<Object> jsonArrayToList(JSONArray arr) {
        List<Object> list = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            try {
                Object val = arr.get(i);
                if (val instanceof JSONArray) {
                    list.add(jsonArrayToList((JSONArray) val));
                } else if (val instanceof JSONObject) {
                    list.add(jsonObjectToMap((JSONObject) val));
                } else {
                    list.add(val);
                }
            } catch (Exception e) {
                list.add(null);
            }
        }
        return list;
    }
    
    private static Map<String, Object> jsonObjectToMap(JSONObject obj) {
        Map<String, Object> map = new HashMap<>();
        Iterator<String> keys = obj.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            try {
                Object val = obj.get(key);
                if (val instanceof JSONArray) {
                    map.put(key, jsonArrayToList((JSONArray) val));
                } else if (val instanceof JSONObject) {
                    map.put(key, jsonObjectToMap((JSONObject) val));
                } else {
                    map.put(key, val);
                }
            } catch (Exception e) {
                map.put(key, null);
            }
        }
        return map;
    }
    
    private static Object callSolutionMethod(Object input) throws Exception {
        Class<?> solutionClass = Class.forName("${className}");
        Method[] methods = solutionClass.getDeclaredMethods();
        
        // Find solution method (usually named "solution")
        Method solutionMethod = null;
        for (Method m : methods) {
            if (m.getName().equals("solution")) {
                solutionMethod = m;
                break;
            }
        }
        
        if (solutionMethod == null) {
            throw new RuntimeException("No solution method found in ${className}");
        }
        
        // Try different calling strategies
        Class<?>[] paramTypes = solutionMethod.getParameterTypes();
        Object[] params = prepareParameters(input, paramTypes);
        
        return solutionMethod.invoke(null, params);
    }
    
    private static Object[] prepareParameters(Object input, Class<?>[] paramTypes) {
        if (paramTypes.length == 0) {
            return new Object[0];
        }
        
        if (paramTypes.length == 1) {
            // Single parameter
            return new Object[]{convertToType(input, paramTypes[0])};
        }
        
        // Multiple parameters - input should be an array/list
        if (input instanceof List) {
            List<?> inputList = (List<?>) input;
            if (inputList.size() == paramTypes.length) {
                Object[] params = new Object[paramTypes.length];
                for (int i = 0; i < paramTypes.length; i++) {
                    params[i] = convertToType(inputList.get(i), paramTypes[i]);
                }
                return params;
            }
        }
        
        throw new RuntimeException("Cannot match parameters. Expected " + 
            paramTypes.length + " parameters but got: " + input);
    }
    
    private static Object convertToType(Object value, Class<?> targetType) {
        if (value == null) return null;
        
        // Handle primitive types and their wrappers
        if (targetType == int.class || targetType == Integer.class) {
            if (value instanceof Number) return ((Number) value).intValue();
            return Integer.parseInt(value.toString());
        }
        if (targetType == double.class || targetType == Double.class) {
            if (value instanceof Number) return ((Number) value).doubleValue();
            return Double.parseDouble(value.toString());
        }
        if (targetType == boolean.class || targetType == Boolean.class) {
            if (value instanceof Boolean) return value;
            return Boolean.parseBoolean(value.toString());
        }
        if (targetType == String.class) {
            return value.toString();
        }
        if (targetType == List.class || targetType == ArrayList.class) {
            if (value instanceof List) return value;
            // Convert array to list
            if (value.getClass().isArray()) {
                return Arrays.asList((Object[]) value);
            }
        }
        if (targetType == int[].class) {
            if (value instanceof List) {
                List<?> list = (List<?>) value;
                int[] arr = new int[list.size()];
                for (int i = 0; i < list.size(); i++) {
                    Object item = list.get(i);
                    if (item instanceof Number) {
                        arr[i] = ((Number) item).intValue();
                    } else {
                        arr[i] = Integer.parseInt(item.toString());
                    }
                }
                return arr;
            }
        }
        
        // Default: try to cast
        return targetType.cast(value);
    }
    
    private static void outputResult(Object result) {
        if (result == null) {
            System.out.println("null");
        } else if (result instanceof int[]) {
            System.out.println(Arrays.toString((int[]) result));
        } else if (result instanceof double[]) {
            System.out.println(Arrays.toString((double[]) result));
        } else if (result instanceof boolean[]) {
            System.out.println(Arrays.toString((boolean[]) result));
        } else if (result instanceof Object[]) {
            System.out.println(Arrays.toString((Object[]) result));
        } else if (result instanceof List) {
            System.out.println(result.toString());
        } else if (result instanceof Map) {
            System.out.println(new JSONObject((Map<?, ?>) result).toString());
        } else {
            System.out.println(result.toString());
        }
    }
}
`;
  fs.writeFileSync(mainFilePath, mainCode);

  // 5️⃣ Add JSON library (simple embedded version since we can't guarantee it's installed)
  const jsonLibPath = path.join(tempDir, "JSON.java");
  const jsonLibCode = `
// Simple JSON implementation for the runner
import java.util.*;
import java.lang.reflect.*;

class JSONArray {
    private List<Object> list = new ArrayList<>();
    
    public JSONArray(String json) {
        json = json.trim().substring(1, json.length() - 1).trim();
        if (json.isEmpty()) return;
        
        String[] parts = splitJson(json);
        for (String part : parts) {
            part = part.trim();
            if (part.startsWith("[")) {
                list.add(new JSONArray(part));
            } else if (part.startsWith("{")) {
                list.add(new JSONObject(part));
            } else if (part.startsWith("\\"")) {
                list.add(part.substring(1, part.length() - 1));
            } else if (part.equals("true") || part.equals("false")) {
                list.add(Boolean.parseBoolean(part));
            } else if (part.equals("null")) {
                list.add(null);
            } else {
                try {
                    list.add(Integer.parseInt(part));
                } catch (Exception e) {
                    try {
                        list.add(Double.parseDouble(part));
                    } catch (Exception e2) {
                        list.add(part);
                    }
                }
            }
        }
    }
    
    private String[] splitJson(String json) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        boolean inString = false;
        StringBuilder current = new StringBuilder();
        
        for (char c : json.toCharArray()) {
            if (c == '\\"' && (current.length() == 0 || current.charAt(current.length() - 1) != '\\\\')) {
                inString = !inString;
            }
            if (!inString) {
                if (c == '[' || c == '{') depth++;
                if (c == ']' || c == '}') depth--;
                if (c == ',' && depth == 0) {
                    parts.add(current.toString());
                    current = new StringBuilder();
                    continue;
                }
            }
            current.append(c);
        }
        if (current.length() > 0) parts.add(current.toString());
        return parts.toArray(new String[0]);
    }
    
    public int length() { return list.size(); }
    public Object get(int index) { return list.get(index); }
    public boolean getBoolean(int index) { return (Boolean) list.get(index); }
    public int getInt(int index) { 
        Object val = list.get(index);
        if (val instanceof Number) return ((Number) val).intValue();
        return Integer.parseInt(val.toString());
    }
    public double getDouble(int index) { 
        Object val = list.get(index);
        if (val instanceof Number) return ((Number) val).doubleValue();
        return Double.parseDouble(val.toString());
    }
    public String getString(int index) { return list.get(index).toString(); }
    public JSONArray getJSONArray(int index) { return (JSONArray) list.get(index); }
    public JSONObject getJSONObject(int index) { return (JSONObject) list.get(index); }
}

class JSONObject {
    private Map<String, Object> map = new HashMap<>();
    
    public JSONObject(String json) {
        json = json.trim().substring(1, json.length() - 1).trim();
        if (json.isEmpty()) return;
        
        String[] pairs = splitJson(json);
        for (String pair : pairs) {
            String[] kv = pair.split(":", 2);
            String key = kv[0].trim().substring(1, kv[0].length() - 1);
            String value = kv[1].trim();
            
            if (value.startsWith("[")) {
                map.put(key, new JSONArray(value));
            } else if (value.startsWith("{")) {
                map.put(key, new JSONObject(value));
            } else if (value.startsWith("\\"")) {
                map.put(key, value.substring(1, value.length() - 1));
            } else if (value.equals("true") || value.equals("false")) {
                map.put(key, Boolean.parseBoolean(value));
            } else if (value.equals("null")) {
                map.put(key, null);
            } else {
                try {
                    map.put(key, Integer.parseInt(value));
                } catch (Exception e) {
                    try {
                        map.put(key, Double.parseDouble(value));
                    } catch (Exception e2) {
                        map.put(key, value);
                    }
                }
            }
        }
    }
    
    public JSONObject(Map<?, ?> map) {
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            this.map.put(entry.getKey().toString(), entry.getValue());
        }
    }
    
    private String[] splitJson(String json) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        boolean inString = false;
        StringBuilder current = new StringBuilder();
        
        for (char c : json.toCharArray()) {
            if (c == '\\"' && (current.length() == 0 || current.charAt(current.length() - 1) != '\\\\')) {
                inString = !inString;
            }
            if (!inString) {
                if (c == '[' || c == '{') depth++;
                if (c == ']' || c == '}') depth--;
                if (c == ',' && depth == 0) {
                    parts.add(current.toString());
                    current = new StringBuilder();
                    continue;
                }
            }
            current.append(c);
        }
        if (current.length() > 0) parts.add(current.toString());
        return parts.toArray(new String[0]);
    }
    
    public Iterator<String> keys() { return map.keySet().iterator(); }
    public Object get(String key) { return map.get(key); }
    public boolean getBoolean(String key) { return (Boolean) map.get(key); }
    public int getInt(String key) { 
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        return Integer.parseInt(val.toString());
    }
    public double getDouble(String key) { 
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).doubleValue();
        return Double.parseDouble(val.toString());
    }
    public String getString(String key) { return map.get(key).toString(); }
    public JSONArray getJSONArray(String key) { return (JSONArray) map.get(key); }
    public JSONObject getJSONObject(String key) { return (JSONObject) map.get(key); }
    
    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            if (!first) sb.append(",");
            sb.append("\\"").append(entry.getKey()).append("\\":");
            Object value = entry.getValue();
            if (value == null) {
                sb.append("null");
            } else if (value instanceof String) {
                sb.append("\\"").append(value).append("\\"");
            } else if (value instanceof List) {
                sb.append(value.toString());
            } else if (value instanceof Map) {
                sb.append(new JSONObject((Map<?, ?>) value));
            } else {
                sb.append(value);
            }
            first = false;
        }
        sb.append("}");
        return sb.toString();
    }
}
`;
  fs.writeFileSync(jsonLibPath, jsonLibCode);

  // 6️⃣ Compile all Java files
  try {
    execSync(`javac ${studentFilePath} ${mainFilePath} ${jsonLibPath}`, { 
      timeout: compileTimeout,
      cwd: tempDir 
    });
  } catch (compileErr) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return {
      compilationError: compileErr.message,
      results: null,
      score: 0,
      summary: {
        passedVisible: 0,
        passedHidden: 0,
        totalVisible: visibleTests.length,
        totalHidden: hiddenTests.length,
        score: 0,
        percentage: "0%"
      }
    };
  }

  // 7️⃣ Function to run a single test
  const runTest = (input, expectedOutput) => {
    try {
      const inputJson = toJavaInput(input);
      const cmd = `java -cp ${tempDir} Main`;
      
      const output = execSync(cmd, {
        input: inputJson,
        timeout: timeout,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).toString().trim();

      // Parse and compare
      const parsedOutput = parseJavaOutput(output);
      let expected;
      try {
        expected = JSON.parse(expectedOutput);
      } catch {
        expected = expectedOutput;
      }

      // Compare
      const outputStr = JSON.stringify(parsedOutput);
      const expectedStr = JSON.stringify(expected);
      const ok = outputStr === expectedStr;

      return {
        output: parsedOutput,
        rawOutput: output,
        ok,
        error: null,
        comparison: ok ? null : { got: outputStr, expected: expectedStr }
      };

    } catch (err) {
      return {
        output: null,
        rawOutput: err.stdout ? err.stdout.toString() : '',
        ok: false,
        error: err.message,
        stderr: err.stderr ? err.stderr.toString() : ''
      };
    }
  };

  // 8️⃣ Run visible tests
  for (const t of visibleTests) {
    const testResult = runTest(t.input, t.output);
    
    if (testResult.ok) passedVisible++;
    
    results.visible.push({
      input: t.input,
      inputType: typeof t.input,
      output: testResult.output,
      rawOutput: testResult.rawOutput,
      expected: t.output,
      ok: testResult.ok,
      error: testResult.error,
      details: testResult.comparison
    });
  }

  // 9️⃣ Run hidden tests
  for (const t of hiddenTests) {
    const testResult = runTest(t.input, t.output);
    
    if (testResult.ok) passedHidden++;
    
    results.hidden.push({
      input: t.input,
      inputType: typeof t.input,
      output: testResult.output,
      rawOutput: testResult.rawOutput,
      expected: t.output,
      ok: testResult.ok,
      error: testResult.error,
      details: testResult.comparison
    });
  }

  // 🔟 Cleanup
  fs.rmSync(tempDir, { recursive: true, force: true });

  const totalTests = visibleTests.length + hiddenTests.length;
  const totalPassed = passedVisible + passedHidden;

  return {
    compilationError: null,
    results,
    summary: {
      passedVisible,
      passedHidden,
      totalVisible: visibleTests.length,
      totalHidden: hiddenTests.length,
      score: totalPassed,
      percentage: totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) + "%" : "0%",
      passed: totalPassed,
      total: totalTests
    }
  };
};