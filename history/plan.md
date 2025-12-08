# Plan to Close Gaps Between babel-preset-solid and gas

## Overview
This document outlines a comprehensive plan to achieve feature parity and performance equivalence between gas (Bun's native SolidJS JSX compiler) and babel-preset-solid (the traditional Babel-based SolidJS compiler).

## Gap Analysis Summary

### Configuration Options Gap
**babel-preset-solid** supports 12+ configuration options that **gas** lacks:
- `delegateEvents` (boolean) - Control event delegation
- `effectWrapper` (string) - Custom effect function name
- `memoWrapper` (string) - Custom memo function name
- `staticMarker` (string) - Static expression marker
- `requireImportSource` (string|false) - JSX import source restriction
- `validate` (boolean) - HTML validation
- `omitNestedClosingTags` (boolean) - Template optimization
- `omitLastClosingTag` (boolean) - Template optimization
- `omitQuotes` (boolean) - Template optimization

### Feature Parity Gaps
- **Universal rendering mode**: gas doesn't properly support `generate: "universal"`
- **Import source validation**: gas ignores `@jsxImportSource` pragmas
- **Static expression markers**: gas doesn't support `/*@once*/` comments
- **HTML validation**: gas lacks DOM structure validation
- **Template optimizations**: gas doesn't minimize template output

### Output Compatibility Gaps
- **Template structure differences**: gas uses different template ID schemes
- **Import organization**: gas generates different import patterns
- **Event delegation control**: gas always delegates, can't be disabled

### Testing & Quality Gaps
- **Test coverage**: babel-preset-solid has 15+ test files vs gas's 1 main test file
- **Fixture testing**: babel-preset-solid uses comprehensive fixture-based testing
- **Cross-platform testing**: gas only tests in Bun environment

## Comprehensive Implementation Plan

### Phase 1: Configuration Options Parity
**Goal**: Add all missing configuration options to gas

**Tasks:**
1. **Add missing option types** to `GasPluginOptions` interface
2. **Implement `delegateEvents` control** - Allow disabling event delegation
3. **Add template optimization options** - `omitNestedClosingTags`, `omitLastClosingTag`, `omitQuotes`
4. **Implement `requireImportSource` validation** - Check JSX pragmas
5. **Add `staticMarker` support** - Recognize `/*@once*/` comments
6. **Implement `effectWrapper`/`memoWrapper`** - Custom reactive function names
7. **Add HTML validation** - DOM structure checking
8. **Support universal mode** - Proper `generate: "universal"` implementation

**Estimated effort**: 2-3 weeks
**Risk**: Medium (requires careful integration with existing codegen)

### Phase 2: Output Compatibility
**Goal**: Ensure gas generates identical code to babel-preset-solid

**Tasks:**
1. **Template ID standardization** - Match babel-preset-solid's `_tmpl$` naming
2. **Import consolidation** - Generate same import statement patterns
3. **Template optimization** - Implement HTML minimization features
4. **Code structure alignment** - Match AST traversal and generation patterns
5. **Cross-validation testing** - Compare outputs for identical inputs

**Estimated effort**: 1-2 weeks
**Risk**: Low (mostly mechanical changes)

### Phase 3: Testing Infrastructure Overhaul
**Goal**: Achieve comprehensive test coverage matching babel-preset-solid

**Tasks:**
1. **Adopt fixture-based testing** - Convert to babel-preset-solid's test structure
2. **Add comprehensive test suites** - DOM, SSR, hydratable, universal modes
3. **Implement snapshot testing** - For output validation
4. **Add cross-browser testing** - Ensure compatibility beyond Bun
5. **Performance regression testing** - Automated benchmarks

**Estimated effort**: 2-3 weeks
**Risk**: Medium (requires test infrastructure rewrite)

### Phase 4: Performance Benchmarking & Optimization
**Goal**: Quantify and optimize performance differences

**Tasks:**
1. **Create benchmark suite** - Compare compilation speed vs babel-preset-solid
2. **Memory usage analysis** - Compare heap usage patterns
3. **Bundle size comparison** - Measure generated code efficiency
4. **Hot reload performance** - Test incremental compilation
5. **Optimization based on findings** - Close any identified performance gaps

**Estimated effort**: 1 week
**Risk**: Low (analysis and measurement focused)

### Phase 5: Error Handling Enhancement
**Goal**: Match babel-preset-solid's error reporting quality

**Tasks:**
1. **Error message standardization** - Align with Babel's error format
2. **Source map integration** - Better debugging experience
3. **Contextual error information** - Include more surrounding code
4. **Recovery suggestions** - Provide helpful fix suggestions

**Estimated effort**: 1 week
**Risk**: Low (enhancement of existing error handling)

### Phase 6: Documentation & Ecosystem
**Goal**: Achieve documentation and ecosystem parity

**Tasks:**
1. **Comprehensive README** - Match babel-preset-solid's documentation depth
2. **Migration guide** - Help users transition from babel-preset-solid
3. **API compatibility layer** - Support babel-preset-solid configuration format
4. **Community integration** - Ensure compatibility with SolidJS tooling

**Estimated effort**: 1 week
**Risk**: Low (documentation focused)

## Success Criteria

1. **100% configuration option parity** - All babel-preset-solid options supported
2. **Identical output generation** - Same code output for same inputs
3. **Comprehensive test coverage** - Equivalent test suite size and quality
4. **Performance equivalence** - No significant performance regression
5. **Drop-in compatibility** - Can replace babel-preset-solid in most projects
6. **Enhanced error reporting** - Better debugging experience than current gas

## Implementation Strategy

**Approach**: Incremental implementation with extensive testing at each phase
**Testing**: Comprehensive fixture-based testing matching babel-preset-solid
**Validation**: Cross-compatibility testing with existing SolidJS projects
**Documentation**: Update docs and examples for each completed phase

**Total estimated effort**: 8-12 weeks
**Risk assessment**: Medium (complex integration but well-understood requirements)

## Current Status
- ✅ Gap analysis completed
- ✅ Detailed implementation plan created
- 🔄 Ready to begin Phase 1 implementation