/**
 * @file geometric-equations.js
 * @description The 55 verified architectural, structural, MEP, and quantity equations for Mizan Platform.
 * Pure mathematical functions, deterministic, typed via JSDoc.
 */

export class GeometricEquations {
  // ── Part 1: Basic Areas & Dimensions ──

  /** 1. Area of Rectangle (m²) */
  static areaRectangle(length, width) {
    if (length < 0 || width < 0) throw new Error('Dimensions must be non-negative.');
    return length * width;
  }

  /** 2. Area of Square (m²) */
  static areaSquare(side) {
    if (side < 0) throw new Error('Side length must be non-negative.');
    return side * side;
  }

  /** 3. Area of Triangle (m²) */
  static areaTriangle(base, height) {
    if (base < 0 || height < 0) throw new Error('Base and height must be non-negative.');
    return (base * height) / 2;
  }

  /** 4. Area of Circle (m²) */
  static areaCircle(radius) {
    if (radius < 0) throw new Error('Radius must be non-negative.');
    return Math.PI * radius * radius;
  }

  /** 5. Area of Trapezoid (m²) */
  static areaTrapezoid(base1, base2, height) {
    if (base1 < 0 || base2 < 0 || height < 0) throw new Error('Bases and height must be non-negative.');
    return ((base1 + base2) * height) / 2;
  }

  /** 6. Area of Parallelogram (m²) */
  static areaParallelogram(base, height) {
    if (base < 0 || height < 0) throw new Error('Base and height must be non-negative.');
    return base * height;
  }

  /** 7. Area of Diamond / Rhombus (m²) */
  static areaDiamond(diagonal1, diagonal2) {
    if (diagonal1 < 0 || diagonal2 < 0) throw new Error('Diagonals must be non-negative.');
    return (diagonal1 * diagonal2) / 2;
  }

  /** 8. Area of Regular Hexagon (m²) */
  static areaHexagon(side) {
    if (side < 0) throw new Error('Side must be non-negative.');
    return (3 * Math.sqrt(3) * side * side) / 2;
  }

  // ── Part 2: Volumes & 3D Solids ──

  /** 9. Volume of Cube (m³) */
  static volumeCube(side) {
    if (side < 0) throw new Error('Side must be non-negative.');
    return side * side * side;
  }

  /** 10. Volume of Rectangular Prism (Room Volume) (m³) */
  static volumeRectangularPrism(length, width, height) {
    if (length < 0 || width < 0 || height < 0) throw new Error('Dimensions must be non-negative.');
    return length * width * height;
  }

  /** 11. Volume of Cylinder (Circular Column / Tank) (m³) */
  static volumeCylinder(radius, height) {
    if (radius < 0 || height < 0) throw new Error('Radius and height must be non-negative.');
    return Math.PI * radius * radius * height;
  }

  /** 12. Volume of Sphere (m³) */
  static volumeSphere(radius) {
    if (radius < 0) throw new Error('Radius must be non-negative.');
    return (4 * Math.PI * radius * radius * radius) / 3;
  }

  /** 13. Volume of Pyramid (m³) */
  static volumePyramid(baseArea, height) {
    if (baseArea < 0 || height < 0) throw new Error('Base area and height must be non-negative.');
    return (baseArea * height) / 3;
  }

  /** 14. Volume of Cone (m³) */
  static volumeCone(radius, height) {
    if (radius < 0 || height < 0) throw new Error('Radius and height must be non-negative.');
    return (Math.PI * radius * radius * height) / 3;
  }

  // ── Part 3: Lengths & Perimeters ──

  /** 15. Perimeter of Rectangle (m) */
  static perimeterRectangle(length, width) {
    if (length < 0 || width < 0) throw new Error('Dimensions must be non-negative.');
    return 2 * (length + width);
  }

  /** 16. Perimeter of Square (m) */
  static perimeterSquare(side) {
    if (side < 0) throw new Error('Side must be non-negative.');
    return 4 * side;
  }

  /** 17. Circumference of Circle (m) */
  static circumferenceCircle(radius) {
    if (radius < 0) throw new Error('Radius must be non-negative.');
    return 2 * Math.PI * radius;
  }

  /** 18. Perimeter of Triangle (m) */
  static perimeterTriangle(a, b, c) {
    if (a < 0 || b < 0 || c < 0) throw new Error('Sides must be non-negative.');
    return a + b + c;
  }

  // ── Part 4: Geometry & Angles ──

  /** 19. Pythagorean Theorem (m) */
  static pythagoreanTheorem(a, b) {
    if (a < 0 || b < 0) throw new Error('Legs must be non-negative.');
    return Math.sqrt(a * a + b * b);
  }

  /** 20. Sum of Polygon Angles (Degrees) */
  static polygonAngleSum(sides) {
    if (sides < 3) throw new Error('Polygon must have at least 3 sides.');
    return (sides - 2) * 180;
  }

  /** 21. Interior Angle of Regular Polygon (Degrees) */
  static regularPolygonAngle(sides) {
    if (sides < 3) throw new Error('Polygon must have at least 3 sides.');
    return ((sides - 2) * 180) / sides;
  }

  // ── Part 5: Advanced Architectural Geometry ──

  /** 22. Golden Ratio Constant (Phi) */
  static goldenRatio() {
    return 1.618033988749895;
  }

  /** 23. Surface Area of Cylinder (m²) */
  static surfaceAreaCylinder(radius, height) {
    if (radius < 0 || height < 0) throw new Error('Dimensions must be non-negative.');
    return 2 * Math.PI * radius * (radius + height);
  }

  /** 24. Surface Area of Sphere (m²) */
  static surfaceAreaSphere(radius) {
    if (radius < 0) throw new Error('Radius must be non-negative.');
    return 4 * Math.PI * radius * radius;
  }

  /** 25. Surface Area of Cube (m²) */
  static surfaceAreaCube(side) {
    if (side < 0) throw new Error('Side must be non-negative.');
    return 6 * side * side;
  }

  // ── Part 6: Landscapes & Site ──

  /** 26. Garden Circular Area (m²) */
  static gardenAreaCircular(radius) {
    return this.areaCircle(radius);
  }

  /** 27. Perimeter Fence Length (m) */
  static fenceLength(length, width) {
    return this.perimeterRectangle(length, width);
  }

  // ── Part 7: Structural & Finishes Takeoff ──

  /** 28. Ceramic Tiles Count (with standard 5% waste) */
  static ceramicTiles(roomArea, tileSize, wastePercentage = 1.05) {
    if (roomArea <= 0 || tileSize <= 0) throw new Error('Area and tile size must be positive.');
    return Math.ceil((roomArea * wastePercentage) / tileSize);
  }

  /** 29. Paint Quantity (Liters) */
  static paintQuantity(wallArea, coverageRate = 9, coats = 2) {
    if (wallArea <= 0 || coverageRate <= 0 || coats <= 0) throw new Error('Parameters must be positive.');
    return Math.ceil((wallArea / coverageRate) * coats);
  }

  /** 30. Reinforcement Steel Weight (Tons) based on concrete volume */
  static reinforcementSteel(concreteVolume, steelKgPerM3 = 60) {
    if (concreteVolume < 0) throw new Error('Volume must be non-negative.');
    return Number(((concreteVolume * steelKgPerM3) / 1000).toFixed(3));
  }

  /** 31. Concrete Quantity (m³) */
  static concreteQuantity(length, width, thickness) {
    return this.volumeRectangularPrism(length, width, thickness);
  }

  // ── Part 8: Lighting & Electrical ──

  /** 32. Recommended Light Bulbs Count based on Room Lux Target */
  static lightBulbsCount(roomArea, luxLevel = 250, bulbWattage = 60) {
    if (roomArea <= 0 || luxLevel <= 0 || bulbWattage <= 0) return 0;
    const requiredTotalLumens = roomArea * luxLevel;
    const lumensPerBulb = bulbWattage * 13.5;
    return Math.max(1, Math.round(requiredTotalLumens / lumensPerBulb));
  }

  /** 33. Electricity Consumption (kWh) */
  static electricityConsumption(kilowatts, hours) {
    if (kilowatts < 0 || hours < 0) throw new Error('Parameters must be non-negative.');
    return kilowatts * hours;
  }

  // ── Part 9: Ventilation & HVAC ──

  /** 34. Required Air Flow Volume (m³/h) */
  static airVolumeRequired(roomVolume, airChangesPerHour = 4) {
    if (roomVolume <= 0 || airChangesPerHour <= 0) throw new Error('Parameters must be positive.');
    return roomVolume * airChangesPerHour;
  }

  /** 35. Required Cooling Capacity (BTU/hr) */
  static coolingCapacityBTU(roomVolume, btuPerCubicMeter = 250) {
    if (roomVolume <= 0) throw new Error('Volume must be positive.');
    return Math.round(roomVolume * btuPerCubicMeter);
  }

  /** 36. Convert Cooling Capacity from BTU/hr to Kilowatts */
  static coolingCapacityKW(btu) {
    if (btu < 0) throw new Error('BTU must be non-negative.');
    return Number((btu / 3412.142).toFixed(2));
  }

  // ── Part 10: Floors & Structural Sections ──

  /** 37. Flooring Material Units */
  static flooringMaterial(roomArea, unitSize, wastePercentage = 1.05) {
    return this.ceramicTiles(roomArea, unitSize, wastePercentage);
  }

  /** 38. Screed Material (Sand & Cement Bags for 5cm layer) */
  static screedMaterial(roomArea, thicknessM = 0.05) {
    if (roomArea <= 0 || thicknessM <= 0) throw new Error('Parameters must be positive.');
    const volume = roomArea * thicknessM;
    return {
      volumeM3: Number(volume.toFixed(3)),
      sandBags50kg: Math.ceil(volume * 100),
      cementBags50kg: Math.ceil(volume * 20)
    };
  }

  /** 39. Recommended Structural Slab Thickness (span / 25) (m) */
  static slabThickness(spanM) {
    if (spanM <= 0) throw new Error('Span must be positive.');
    return Number((spanM / 25).toFixed(3));
  }

  /** 40. Recommended Reinforced Concrete Beam Height (span / 12) (m) */
  static beamHeight(spanM) {
    if (spanM <= 0) throw new Error('Span must be positive.');
    return Number((spanM / 12).toFixed(3));
  }

  // ── Part 11: Fenestration & Openings ──

  /** 41. Required Daylight Window Area (SBC/Standard: Room Area / 8) (m²) */
  static windowArea(roomArea, ratio = 8) {
    if (roomArea <= 0 || ratio <= 0) throw new Error('Parameters must be positive.');
    return Number((roomArea / ratio).toFixed(2));
  }

  /** 42. Recommended Doors Count */
  static doorsCount(roomCount, emergencyExits = 2) {
    if (roomCount < 0) throw new Error('Room count must be non-negative.');
    return roomCount + emergencyExits;
  }

  // ── Part 12: Plumbing & Hydraulics ──

  /** 43. Daily Household Water Consumption (Liters/day) */
  static waterConsumptionDaily(numberOfPeople, litersPerPerson = 175) {
    if (numberOfPeople <= 0) throw new Error('Occupant count must be positive.');
    return numberOfPeople * litersPerPerson;
  }

  /** 44. Required Water Tank Storage Capacity (m³) */
  static waterTankVolume(dailyConsumptionLiters, reserveDays = 1.5) {
    if (dailyConsumptionLiters <= 0 || reserveDays <= 0) throw new Error('Parameters must be positive.');
    return Number(((dailyConsumptionLiters * reserveDays) / 1000).toFixed(3));
  }

  /** 45. Recommended Pipe Internal Diameter (mm) based on peak flow rate (L/s) */
  static pipeDiameterMm(flowRateLps) {
    if (flowRateLps <= 0.5) return 15;
    if (flowRateLps <= 1.0) return 20;
    if (flowRateLps <= 2.0) return 25;
    if (flowRateLps <= 3.0) return 32;
    if (flowRateLps <= 5.0) return 40;
    return 50;
  }

  // ── Part 13: Cost & Valuation ──

  /** 46. Total Construction Cost (SAR) */
  static totalConstructionCost(totalAreaSqM, costPerSquareMeter) {
    if (totalAreaSqM <= 0 || costPerSquareMeter <= 0) throw new Error('Parameters must be positive.');
    return totalAreaSqM * costPerSquareMeter;
  }

  /** 47. Standard Cost Breakdown Distribution (SAR) */
  static costDistribution(totalCost) {
    if (totalCost <= 0) throw new Error('Total cost must be positive.');
    return {
      substructureAndFrames: Math.round(totalCost * 0.325),
      concreteAndReinforcement: Math.round(totalCost * 0.225),
      finishesAndFaçades: Math.round(totalCost * 0.275),
      mepElectricalPlumbing: Math.round(totalCost * 0.125),
      hvacEquipment: Math.round(totalCost * 0.09)
    };
  }

  /** 48. Payback Period for Capital Investments (Years) */
  static paybackPeriodYears(totalCost, annualIncomeOrSavings) {
    if (totalCost <= 0 || annualIncomeOrSavings <= 0) throw new Error('Parameters must be positive.');
    return Number((totalCost / annualIncomeOrSavings).toFixed(2));
  }

  /** 49. Return on Investment (%) */
  static returnOnInvestment(annualIncome, totalCost) {
    if (totalCost <= 0) throw new Error('Total cost must be positive.');
    return Number(((annualIncome / totalCost) * 100).toFixed(2));
  }

  // ── Part 14: Thermal Envelope Physics ──

  /** 50. Envelope Heat Loss (Watts) (Q = A * U * DeltaT) */
  static heatLossWatts(wallAreaSqM, uValue, deltaTempC) {
    if (wallAreaSqM <= 0 || uValue < 0 || deltaTempC < 0) throw new Error('Parameters must be non-negative.');
    return Math.round(wallAreaSqM * uValue * deltaTempC);
  }

  /** 51. Thermal Insulation Energy Savings Percentage (%) */
  static energySavingsPercentage(oldUValue, newUValue) {
    if (oldUValue <= 0 || newUValue < 0 || newUValue > oldUValue) {
      throw new Error('Invalid U-values for energy savings calculation.');
    }
    return Number(((1 - (newUValue / oldUValue)) * 100).toFixed(1));
  }

  // ── Part 15: Spatial Proportions & Ergonomics ──

  /** 52. Golden Ratio Proportional Length based on Width (m) */
  static goldenRatioLength(widthM) {
    if (widthM <= 0) throw new Error('Width must be positive.');
    return Number((widthM * 1.6180339887).toFixed(2));
  }

  /** 53. Ergonomic Furniture Footprint Area (m²) */
  static furnitureAreaRatio(roomArea, roomType = 'bedroom') {
    if (roomArea <= 0) throw new Error('Room area must be positive.');
    const ratios = {
      bedroom: 0.35,
      livingroom: 0.25,
      kitchen: 0.45,
      majlis: 0.30
    };
    const ratio = ratios[roomType.toLowerCase()] || 0.30;
    return Number((roomArea * ratio).toFixed(2));
  }

  /** 54. Ideal Ceiling Height (m) */
  static idealCeilingHeight(roomType = 'bedroom') {
    const heights = {
      bedroom: 3.0,
      livingroom: 3.4,
      majlis: 3.6,
      kitchen: 2.8,
      bathroom: 2.6,
      corridor: 2.8
    };
    return heights[roomType.toLowerCase()] || 3.0;
  }

  /** 55. Maximum Social Gathering Capacity (Persons) */
  static maxVisitorsCapacity(gatheringAreaSqM, spacePerPerson = 0.5) {
    if (gatheringAreaSqM <= 0 || spacePerPerson <= 0) return 0;
    return Math.floor(gatheringAreaSqM / spacePerPerson);
  }
}
