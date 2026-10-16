;; pokie.math.v2. One production evaluator for generated Node and portable WASM.
;; Header/layout and resource limits are defined by SharedSlotMath.ts.
(module
  (import "pokie" "next_random" (func $random (result f64)))
  (memory (export "memory") 1 1)
  (func $h (param $p i32) (result i32) (i32.load (local.get $p)))
  (func $get (param $base i32) (param $i i32) (result i32)
    (i32.load (i32.add (local.get $base) (i32.mul (local.get $i) (i32.const 4)))))
  (func $put (param $base i32) (param $i i32) (param $v i32)
    (i32.store (i32.add (local.get $base) (i32.mul (local.get $i) (i32.const 4))) (local.get $v)))
  (func $cell (param $i i32) (result i32) (call $get (call $h (i32.const 48)) (local.get $i)))
  (func $wild (param $s i32) (result i32) (call $get (call $h (i32.const 36)) (local.get $s)))
  (func $scatter (param $s i32) (result i32) (call $get (call $h (i32.const 40)) (local.get $s)))
  (func $pos (param $i i32) (param $v i32) (call $put (call $h (i32.const 60)) (local.get $i) (local.get $v)))
  (func $emit (param $kind i32) (param $s i32) (param $count i32) (param $id i32) (param $ways f64) (param $bet f64) (param $n i32)
    (local $amount f64) (local $p i32) (local $i i32)
    ;; Preserve Paytable's multiplication before multiplicative ways and summation.
    (local.set $amount (f64.mul (f64.mul
      (f64.load (i32.add (call $h (i32.const 32)) (i32.mul (i32.add (i32.mul (local.get $s) (i32.add (call $h (i32.const 92)) (i32.const 1))) (local.get $count)) (i32.const 8))))
      (local.get $bet)) (local.get $ways)))
    (if (f64.gt (local.get $amount) (f64.const 0)) (then
      (local.set $p (i32.add (call $h (i32.const 52)) (i32.mul (call $h (i32.const 72)) (call $h (i32.const 56)))))
      (i32.store (local.get $p) (local.get $kind))
      (i32.store offset=4 (local.get $p) (local.get $s))
      (i32.store offset=8 (local.get $p) (local.get $id))
      (i32.store offset=12 (local.get $p) (local.get $n))
      (f64.store offset=16 (local.get $p) (local.get $ways))
      (f64.store offset=24 (local.get $p) (local.get $amount))
      (block $end (loop $copy
        (br_if $end (i32.ge_u (local.get $i) (local.get $n)))
        (call $put (i32.add (local.get $p) (i32.const 32)) (local.get $i) (call $get (call $h (i32.const 60)) (local.get $i)))
        (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $copy)))
      (i32.store (i32.const 72) (i32.add (call $h (i32.const 72)) (i32.const 1)))
      (f64.store (i32.const 80) (f64.add (f64.load (i32.const 80)) (local.get $amount))))))
  (func $lines (param $bet f64)
    (local $l i32) (local $n i32) (local $r i32) (local $s i32) (local $target i32) (local $ok i32) (local $p i32)
    (block $end (loop $line
      (br_if $end (i32.ge_u (local.get $l) (call $h (i32.const 20))))
      (local.set $n (call $h (i32.const 0)))
      (block $selected (loop $pattern
        (br_if $selected (i32.lt_s (local.get $n) (i32.const 2)))
        (local.set $target (i32.const -1)) (local.set $ok (i32.const 1)) (local.set $r (i32.const 0))
        (block $rowsEnd (loop $row
          (br_if $rowsEnd (i32.ge_u (local.get $r) (local.get $n)))
          (local.set $p (i32.add (i32.mul (local.get $r) (call $h (i32.const 4)))
            (call $get (call $h (i32.const 28)) (i32.add (i32.mul (local.get $l) (call $h (i32.const 0))) (local.get $r)))))
          (call $pos (local.get $r) (local.get $p))
          (local.set $s (call $cell (local.get $p)))
          (if (i32.eqz (call $wild (local.get $s))) (then
            (if (i32.eq (local.get $target) (i32.const -1)) (then (local.set $target (local.get $s))))
            (if (i32.ne (local.get $target) (local.get $s)) (then (local.set $ok (i32.const 0))))))
          (local.set $r (i32.add (local.get $r) (i32.const 1))) (br $row)))
        (if (i32.and (local.get $ok) (i32.ne (local.get $target) (i32.const -1))) (then
          (if (i32.eqz (call $scatter (local.get $target))) (then
            (call $emit (i32.const 0) (local.get $target) (local.get $n) (local.get $l) (f64.const 1) (local.get $bet) (local.get $n))))
          (br $selected)))
        (local.set $n (i32.sub (local.get $n) (i32.const 1))) (br $pattern)))
      (local.set $l (i32.add (local.get $l) (i32.const 1))) (br $line))))
  (func $scatters (param $bet f64)
    (local $s i32) (local $order i32) (local $i i32) (local $n i32)
    (block $end (loop $symbol
      (br_if $end (i32.ge_u (local.get $order) (call $h (i32.const 8))))
      (local.set $s (call $get (call $h (i32.const 112)) (local.get $order)))
      (if (call $scatter (local.get $s)) (then
        (local.set $i (i32.const 0)) (local.set $n (i32.const 0))
        (block $cellsEnd (loop $cells
          (br_if $cellsEnd (i32.ge_u (local.get $i) (call $h (i32.const 92))))
          (if (i32.eq (call $cell (local.get $i)) (local.get $s)) (then
            (call $pos (local.get $n) (local.get $i)) (local.set $n (i32.add (local.get $n) (i32.const 1)))))
          (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $cells)))
        (call $emit (i32.const 1) (local.get $s) (local.get $n) (i32.const 0) (f64.const 1) (local.get $bet) (local.get $n))))
      (local.set $order (i32.add (local.get $order) (i32.const 1))) (br $symbol))))
  (func $ways (param $bet f64)
    (local $s i32) (local $order i32) (local $r i32) (local $row i32) (local $n i32) (local $matches i32) (local $p i32) (local $candidate i32) (local $ways f64)
    (block $end (loop $symbol
      (br_if $end (i32.ge_u (local.get $order) (call $h (i32.const 8))))
      (local.set $s (call $get (call $h (i32.const 100)) (local.get $order)))
      (if (i32.eqz (i32.or (call $wild (local.get $s)) (call $scatter (local.get $s)))) (then
        (local.set $r (i32.const 0)) (local.set $n (i32.const 0)) (local.set $ways (f64.const 1))
        (block $reelsEnd (loop $reels
          (br_if $reelsEnd (i32.ge_u (local.get $r) (call $h (i32.const 0))))
          (local.set $matches (i32.const 0)) (local.set $row (i32.const 0))
          (block $rowsEnd (loop $rows
            (br_if $rowsEnd (i32.ge_u (local.get $row) (call $h (i32.const 4))))
            (local.set $p (i32.add (i32.mul (local.get $r) (call $h (i32.const 4))) (local.get $row)))
            (local.set $candidate (call $cell (local.get $p)))
            (if (i32.or (i32.eq (local.get $candidate) (local.get $s)) (call $wild (local.get $candidate))) (then
              (call $pos (local.get $n) (local.get $p)) (local.set $n (i32.add (local.get $n) (i32.const 1)))
              (local.set $matches (i32.add (local.get $matches) (i32.const 1)))))
            (local.set $row (i32.add (local.get $row) (i32.const 1))) (br $rows)))
          (br_if $reelsEnd (i32.eqz (local.get $matches)))
          (local.set $ways (f64.mul (local.get $ways) (f64.convert_i32_u (local.get $matches))))
          (local.set $r (i32.add (local.get $r) (i32.const 1))) (br $reels)))
        (if (local.get $r) (then (call $emit (i32.const 2) (local.get $s) (local.get $r) (i32.const 0) (local.get $ways) (local.get $bet) (local.get $n))))))
      (local.set $order (i32.add (local.get $order) (i32.const 1))) (br $symbol))))
  (func $join (param $p i32) (param $s i32) (param $top i32) (result i32)
    (if (i32.and (i32.ge_s (local.get $p) (i32.const 0)) (i32.lt_u (local.get $p) (call $h (i32.const 92)))) (then
      (if (i32.eqz (call $get (call $h (i32.const 64)) (local.get $p))) (then
        (if (i32.or (i32.eq (call $cell (local.get $p)) (local.get $s)) (call $wild (call $cell (local.get $p)))) (then
          (call $put (call $h (i32.const 64)) (local.get $p) (i32.const 1))
          (call $put (call $h (i32.const 68)) (local.get $top) (local.get $p))
          (return (i32.add (local.get $top) (i32.const 1)))))))))
    (local.get $top))
  (func $clusters (param $bet f64)
    (local $i i32) (local $p i32) (local $s i32) (local $top i32) (local $n i32) (local $id i32)
    (block $clearEnd (loop $clear
      (br_if $clearEnd (i32.ge_u (local.get $i) (call $h (i32.const 92))))
      (call $put (call $h (i32.const 64)) (local.get $i) (i32.const 0))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $clear)))
    (local.set $i (i32.const 0))
    (block $end (loop $start
      (br_if $end (i32.ge_u (local.get $i) (call $h (i32.const 92))))
      (local.set $s (call $cell (local.get $i)))
      (if (i32.eqz (i32.or (call $wild (local.get $s)) (call $get (call $h (i32.const 64)) (local.get $i)))) (then
        (local.set $n (i32.const 0)) (local.set $top (call $join (local.get $i) (local.get $s) (i32.const 0)))
        (block $stackEnd (loop $stack
          (br_if $stackEnd (i32.eqz (local.get $top)))
          (local.set $top (i32.sub (local.get $top) (i32.const 1)))
          (local.set $p (call $get (call $h (i32.const 68)) (local.get $top)))
          (call $pos (local.get $n) (local.get $p)) (local.set $n (i32.add (local.get $n) (i32.const 1)))
          ;; Match production DFS's left/right/up/down push order, including wild ownership.
          (local.set $top (call $join (i32.sub (local.get $p) (call $h (i32.const 4))) (local.get $s) (local.get $top)))
          (local.set $top (call $join (i32.add (local.get $p) (call $h (i32.const 4))) (local.get $s) (local.get $top)))
          (if (i32.ne (i32.rem_u (local.get $p) (call $h (i32.const 4))) (i32.const 0)) (then
            (local.set $top (call $join (i32.sub (local.get $p) (i32.const 1)) (local.get $s) (local.get $top)))))
          (if (i32.lt_u (i32.add (i32.rem_u (local.get $p) (call $h (i32.const 4))) (i32.const 1)) (call $h (i32.const 4))) (then
            (local.set $top (call $join (i32.add (local.get $p) (i32.const 1)) (local.get $s) (local.get $top)))))
          (br $stack)))
        (if (i32.ge_u (local.get $n) (call $h (i32.const 16))) (then
          (call $emit (i32.const 3) (local.get $s) (local.get $n) (local.get $id) (f64.const 1) (local.get $bet) (local.get $n))
          (local.set $id (i32.add (local.get $id) (i32.const 1)))))))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $start))))
  (func $validateBet (param $bet f64)
    (local $i i32)
    (block $end (loop $bets
      (br_if $end (i32.ge_u (local.get $i) (call $h (i32.const 104))))
      (if (f64.eq (local.get $bet) (f64.load (i32.add (call $h (i32.const 108)) (i32.mul (local.get $i) (i32.const 8))))) (then return))
      (local.set $i (i32.add (local.get $i) (i32.const 1))) (br $bets)))
    unreachable)
  (func $evaluate (export "evaluate") (param $bet f64) (result f64)
    (call $validateBet (local.get $bet))
    (i32.store (i32.const 72) (i32.const 0)) (f64.store (i32.const 80) (f64.const 0))
    (if (i32.eq (call $h (i32.const 12)) (i32.const 0)) (then (call $lines (local.get $bet)) (call $scatters (local.get $bet))))
    (if (i32.eq (call $h (i32.const 12)) (i32.const 1)) (then (call $ways (local.get $bet))))
    (if (i32.eq (call $h (i32.const 12)) (i32.const 2)) (then (call $clusters (local.get $bet))))
    (f64.load (i32.const 80)))
  (func (export "play") (param $bet f64) (result f64)
    (local $r i32) (local $row i32) (local $length i32) (local $strip i32) (local $stop i32) (local $draw f64)
    (call $validateBet (local.get $bet))
    (block $end (loop $reels
      (br_if $end (i32.ge_u (local.get $r) (call $h (i32.const 0))))
      (local.set $length (call $get (call $h (i32.const 24)) (i32.mul (local.get $r) (i32.const 2))))
      (local.set $strip (call $get (call $h (i32.const 24)) (i32.add (i32.mul (local.get $r) (i32.const 2)) (i32.const 1))))
      (local.set $draw (call $random))
      (if (i32.eqz (i32.and (f64.ge (local.get $draw) (f64.const 0)) (f64.lt (local.get $draw) (f64.const 1)))) (then unreachable))
      (local.set $stop (i32.trunc_f64_u (f64.mul (local.get $draw) (f64.convert_i32_u (local.get $length)))))
      (call $put (call $h (i32.const 44)) (local.get $r) (local.get $stop))
      (local.set $row (i32.const 0))
      (block $rowsEnd (loop $rows
        (br_if $rowsEnd (i32.ge_u (local.get $row) (call $h (i32.const 4))))
        (call $put (call $h (i32.const 48)) (i32.add (i32.mul (local.get $r) (call $h (i32.const 4))) (local.get $row))
          (call $get (local.get $strip) (i32.rem_u (i32.add (local.get $stop) (local.get $row)) (local.get $length))))
        (local.set $row (i32.add (local.get $row) (i32.const 1))) (br $rows)))
      (local.set $r (i32.add (local.get $r) (i32.const 1))) (br $reels)))
    (call $evaluate (local.get $bet)))
)
