// Simulate the typing flow for German number input with comma
const parseGermanNumber = (v) => {
  if (!v) return 0;
  return parseFloat(v.replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
};
const formatGermanNumber = (n) => {
  if (n == null || isNaN(n)) return '';
  return String(n).replace('.', ',');
};

let results = [];
let pass = true;

// Simulate the controlled-input flow w/ numStr (raw) + form (parsed)
let numStr = {};
let form = {};

function type(field, v) {
  numStr = { ...numStr, [field]: v };
  form = { ...form, [field]: parseGermanNumber(v) };
}

// Step 1: user types "1"
type('stock', '1');
results.push({ step: 1, displayed: numStr.stock, parsed: form.stock, expected_disp: '1', expected_parsed: 1 });
if (numStr.stock !== '1' || form.stock !== 1) pass = false;

// Step 2: user types "1,"
type('stock', '1,');
results.push({ step: 2, displayed: numStr.stock, parsed: form.stock, expected_disp: '1,', expected_parsed: 1 });
if (numStr.stock !== '1,' || form.stock !== 1) pass = false;

// Step 3: user types "1,5"
type('stock', '1,5');
results.push({ step: 3, displayed: numStr.stock, parsed: form.stock, expected_disp: '1,5', expected_parsed: 1.5 });
if (numStr.stock !== '1,5' || form.stock !== 1.5) pass = false;

// Step 4: user types "1,50"
type('stock', '1,50');
results.push({ step: 4, displayed: numStr.stock, parsed: form.stock, expected_disp: '1,50', expected_parsed: 1.5 });
if (numStr.stock !== '1,50' || form.stock !== 1.5) pass = false;

// Price test "12,99"
type('price', '1');
type('price', '12');
type('price', '12,');
type('price', '12,9');
type('price', '12,99');
results.push({ step: 'price', displayed: numStr.price, parsed: form.price, expected_disp: '12,99', expected_parsed: 12.99 });
if (numStr.price !== '12,99' || form.price !== 12.99) pass = false;

// Verify the ANTI-pattern (old bug) would have failed:
// Old: value={formatGermanNumber(form.stock)}
// If user typed "1," → form.stock = parseGermanNumber("1,") = 1 → display = formatGermanNumber(1) = "1"
// → COMMA STRIPPED. The new fix avoids this because value reads numStr (raw), not formatted form.
const oldBugDemo = formatGermanNumber(parseGermanNumber('1,'));
results.push({ step: 'old_bug_demo', input: '1,', old_display: oldBugDemo, note: 'Old code would have shown this (comma stripped)' });
if (oldBugDemo !== '1') pass = false; // confirms old bug behavior

// Verify openEdit pre-fill
const m = { stock_quantity: 1.5, low_stock_threshold: 0.5, default_quantity: 2, price_per_unit: 12.99 };
const preFilled = {
  stock: m.stock_quantity != null ? formatGermanNumber(m.stock_quantity) : '',
  threshold: m.low_stock_threshold != null ? formatGermanNumber(m.low_stock_threshold) : '',
  defaultQty: m.default_quantity != null ? formatGermanNumber(m.default_quantity) : '',
  price: m.price_per_unit != null ? formatGermanNumber(m.price_per_unit) : '',
};
results.push({ step: 'openEdit_prefill', preFilled, expected: { stock: '1,5', threshold: '0,5', defaultQty: '2', price: '12,99' } });
if (preFilled.stock !== '1,5' || preFilled.price !== '12,99') pass = false;

console.log(JSON.stringify(results, null, 2));
console.log('OVERALL: ' + (pass ? 'PASS' : 'FAIL'));
process.exit(pass ? 0 : 1);
