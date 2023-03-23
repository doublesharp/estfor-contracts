import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {EstforConstants, EstforTypes} from "@paintswap/estfor-definitions";
import {SHADOW_SCROLL} from "@paintswap/estfor-definitions/constants";
import {ActionInput} from "@paintswap/estfor-definitions/types";
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {getActionId} from "../scripts/utils";

describe("World", () => {
  const deployContracts = async () => {
    // Contracts are deployed using the first signer/account by default
    const [owner, alice] = await ethers.getSigners();

    const MockOracleClient = await ethers.getContractFactory("MockOracleClient");
    const mockOracleClient = await MockOracleClient.deploy();

    // Add some dummy blocks so that world can access them
    for (let i = 0; i < 5; ++i) {
      await owner.sendTransaction({
        to: owner.address,
        value: 1,
      });
    }

    // Create the world
    const subscriptionId = 2;
    const World = await ethers.getContractFactory("World");
    const world = await upgrades.deployProxy(World, [mockOracleClient.address, subscriptionId], {
      kind: "uups",
    });

    const minSeedUpdateTime = await world.MIN_SEED_UPDATE_TIME();

    return {
      world,
      mockOracleClient,
      minSeedUpdateTime,
      owner,
      alice,
    };
  };

  describe("Seed", () => {
    it("Requesting random words", async () => {
      const {world, mockOracleClient, minSeedUpdateTime} = await loadFixture(deployContracts);
      await expect(world.requestSeedUpdate()).to.be.reverted; // Too soon
      await ethers.provider.send("evm_increaseTime", [minSeedUpdateTime]);
      await world.requestSeedUpdate();

      const startOffset = 5;
      let requestId = await world.requestIds(startOffset);
      expect(requestId).to.be.greaterThanOrEqual(1);

      let randomWord = await world.randomWords(requestId, 0);
      expect(randomWord).to.eq(0);

      // Retrieve the random number
      await mockOracleClient.fulfill(requestId, world.address);
      randomWord = await world.randomWords(requestId, 0);
      expect(randomWord).to.not.eq(0);

      // Try fulfill same request should fail
      await expect(mockOracleClient.fulfill(requestId, world.address)).to.be.reverted;

      // Requesting new seed too soon
      await expect(world.requestSeedUpdate()).to.be.reverted;

      // Increase time and check it works
      await ethers.provider.send("evm_increaseTime", [minSeedUpdateTime]);
      await world.requestSeedUpdate();
      requestId = await world.requestIds(startOffset + 1);
      await mockOracleClient.fulfill(requestId, world.address);

      // Increase it 2x more, should allow 2 random seeds to be requested
      await ethers.provider.send("evm_increaseTime", [minSeedUpdateTime * 2]);
      await world.requestSeedUpdate();
      requestId = await world.requestIds(startOffset + 2);
      await mockOracleClient.fulfill(requestId, world.address);
      await world.requestSeedUpdate();
      requestId = await world.requestIds(startOffset + 3);
      await mockOracleClient.fulfill(requestId, world.address);
      await expect(world.requestSeedUpdate()).to.be.reverted;
    });

    it("getRandomWord", async () => {
      const {world, mockOracleClient, minSeedUpdateTime} = await loadFixture(deployContracts);
      const blockNum = await ethers.provider.getBlockNumber();
      const currentBlock = await ethers.provider.getBlock(blockNum);
      const currentTimestamp = currentBlock.timestamp;
      await ethers.provider.send("evm_increaseTime", [minSeedUpdateTime]);
      await world.requestSeedUpdate();
      let requestId = await world.requestIds(5);
      await mockOracleClient.fulfill(requestId, world.address);

      expect(await world.hasRandomWord(currentTimestamp)).to.be.true;
      await expect(world.getRandomWord(currentTimestamp)).to.not.be.reverted;
      // Gives unhandled project rejection for some reason
      // Before 5 day offset
      await expect(world.getRandomWord(currentTimestamp - minSeedUpdateTime * 6)).to.be.reverted;
      // After offset
      await expect(world.getRandomWord(currentTimestamp + minSeedUpdateTime)).to.be.reverted;
    });

    it("Get full/multiple words", async () => {
      const {world, mockOracleClient, minSeedUpdateTime} = await loadFixture(deployContracts);
      const blockNum = await ethers.provider.getBlockNumber();
      const currentBlock = await ethers.provider.getBlock(blockNum);
      const currentTimestamp = currentBlock.timestamp;
      await ethers.provider.send("evm_increaseTime", [minSeedUpdateTime]);
      await world.requestSeedUpdate();
      let requestId = await world.requestIds(5);
      await mockOracleClient.fulfill(requestId, world.address);

      const fullWords = await world.getFullRandomWords(currentTimestamp);
      const multipleWords = await world.getMultipleFullRandomWords(currentTimestamp);
      expect(fullWords).to.eql(multipleWords[0]);
      expect(multipleWords.length).to.eq(5);
      for (let i = 0; i < 5; ++i) {
        expect(multipleWords[i][0]).to.not.eq(0);
        expect(multipleWords[i][1]).to.not.eq(0);
        expect(multipleWords[i][2]).to.not.eq(0);
      }
    });
  });

  describe("Actions", () => {
    it("Add/Edit/Delete normal", async () => {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      let tx = await world.addAction({
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      });
      const actionId = await getActionId(tx);
      expect((await world.actions(actionId)).skill).to.eq(EstforTypes.Skill.COMBAT);
      await world.editAction({
        actionId,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 20,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      });
      expect((await world.actions(actionId)).xpPerHour).to.eq(20);
      expect((await world.actions(actionId)).isAvailable).to.be.false;
      await world.setAvailable(actionId, true);
      expect((await world.actions(actionId)).isAvailable).to.be.true;
      await world.setAvailable(actionId, false);
      expect((await world.actions(actionId)).isAvailable).to.be.false;

      // Set available on an action that is dynamic (this should be random only)
      await world.editAction({
        actionId,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: true,
          numSpawned: 1,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      });
      await expect(world.setAvailable(actionId, false)).to.be.reverted;
    });

    it("Dynamic actions", async () => {
      // Dynamic actions TODO
    });
  });

  describe("ActionChoices", () => {
    it("Cannot use id 0", async () => {
      const {world} = await loadFixture(deployContracts);
      const choiceId = 0;
      await expect(
        world.addActionChoice(EstforConstants.NONE, choiceId, {
          skill: EstforTypes.Skill.MAGIC,
          diff: 2,
          xpPerHour: 0,
          minXP: 0,
          rate: 1 * 10,
          inputTokenId1: EstforConstants.AIR_SCROLL,
          num1: 1,
          inputTokenId2: EstforConstants.NONE,
          num2: 0,
          inputTokenId3: EstforConstants.NONE,
          num3: 0,
          outputTokenId: EstforConstants.NONE,
          outputNum: 0,
          successPercent: 100,
        })
      ).to.be.reverted;
    });
  });

  describe("ActionRewards", () => {
    it("Guaranteed reward duplicates not allowed", async () => {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [
          {itemTokenId: EstforConstants.AIR_SCROLL, rate: 200},
          {itemTokenId: EstforConstants.AIR_SCROLL, rate: 100},
        ],
        randomRewards: [],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(world, "GuaranteedRewardsNoDuplicates");
      action.guaranteedRewards[0].itemTokenId = SHADOW_SCROLL;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Random reward order", async () => {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [
          {itemTokenId: EstforConstants.SHADOW_SCROLL, chance: 30, amount: 1},
          {itemTokenId: EstforConstants.AIR_SCROLL, chance: 50, amount: 1},
          {itemTokenId: EstforConstants.AQUA_SCROLL, chance: 100, amount: 1},
          {itemTokenId: EstforConstants.HELL_SCROLL, chance: 200, amount: 1},
        ],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(world, "RandomRewardsMustBeInOrder");
      action.randomRewards[0].chance = 300;
      await expect(world.addAction(action)).to.be.revertedWithCustomError(world, "RandomRewardsMustBeInOrder");
      action.randomRewards[1].chance = 250;
      await expect(world.addAction(action)).to.be.revertedWithCustomError(world, "RandomRewardsMustBeInOrder");
      action.randomRewards[2].chance = 225;
      await expect(world.addAction(action)).to.not.be.reverted;
    });

    it("Random reward duplicate not allowed", async () => {
      const {world} = await loadFixture(deployContracts);
      const actionAvailable = false;
      const action: ActionInput = {
        actionId: 1,
        info: {
          skill: EstforTypes.Skill.COMBAT,
          xpPerHour: 3600,
          minXP: 0,
          isDynamic: false,
          numSpawned: 1,
          handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
          handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
          isAvailable: actionAvailable,
          actionChoiceRequired: true,
          successPercent: 100,
        },
        guaranteedRewards: [],
        randomRewards: [
          {itemTokenId: EstforConstants.AIR_SCROLL, chance: 200, amount: 1},
          {itemTokenId: EstforConstants.AIR_SCROLL, chance: 100, amount: 1},
        ],
        combatStats: EstforTypes.emptyCombatStats,
      };

      await expect(world.addAction(action)).to.be.revertedWithCustomError(world, "RandomRewardNoDuplicates");
      action.randomRewards[0].itemTokenId = SHADOW_SCROLL;
      await expect(world.addAction(action)).to.not.be.reverted;
    });
  });
});
