// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./PlayersBase.sol";

contract PlayersImplBase is PlayersBase {
  // From UUPSUpgradeable
  uint256[50] private __gap;
  // From OwnableUpgradeable
  uint256[50] private __gap1;
  // From ReentrancyGuardUpgradeable
  uint256[50] private __gap2;
}
