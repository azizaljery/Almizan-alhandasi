export class ICalculationSolver {
  constructor(name, version, solverType = 'PRELIMINARY_DETERMINISTIC') {
    this.name = name;
    this.version = version;
    this.solverType = solverType;
  }
}

export class IStructuralSolver extends ICalculationSolver {
  async evaluateSpansAndLoadPaths(context) {
    throw new Error('evaluateSpansAndLoadPaths must be implemented by subclass.');
  }
}

export class IElectricalLoadEngine extends ICalculationSolver {
  async estimateDemandAndClearances(context) {
    throw new Error('estimateDemandAndClearances must be implemented by subclass.');
  }
}

export class IHVACLoadEngine extends ICalculationSolver {
  async estimateCoolingAndPlenumEnvelopes(context) {
    throw new Error('estimateCoolingAndPlenumEnvelopes must be implemented by subclass.');
  }
}
