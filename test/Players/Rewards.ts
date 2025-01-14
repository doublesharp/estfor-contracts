import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {EstforConstants, EstforTypes} from "@paintswap/estfor-definitions";
import {BRONZE_ARROW} from "@paintswap/estfor-definitions/constants";
import {BoostType} from "@paintswap/estfor-definitions/types";
import {expect} from "chai";
import {ethers} from "hardhat";
import {bronzeHelmetStats, emptyActionChoice, getActionChoiceId, getActionId, getRequestId} from "../utils";
import {playersFixture} from "./PlayersFixture";
import {setupBasicWoodcutting} from "./utils";

const actionIsAvailable = true;

describe("Rewards", function () {
  this.retries(3);

  it("XP threshold rewards, single", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_AXE,
      equipPosition: EstforTypes.EquipPosition.RIGHT_HAND,
    });

    const rate = 100 * 10; // per hour
    const tx = await world.addAction({
      actionId: 1,
      info: {
        skill: EstforTypes.Skill.WOODCUTTING,
        xpPerHour: 3600,
        minXP: 0,
        isDynamic: false,
        numSpawned: 0,
        handItemTokenIdRangeMin: EstforConstants.WOODCUTTING_BASE,
        handItemTokenIdRangeMax: EstforConstants.WOODCUTTING_MAX,
        isAvailable: actionIsAvailable,
        actionChoiceRequired: false,
        successPercent: 100,
      },
      guaranteedRewards: [{itemTokenId: EstforConstants.LOG, rate}],
      randomRewards: [],
      combatStats: EstforTypes.emptyCombatStats,
    });

    const actionId = await getActionId(tx);
    const queuedAction: EstforTypes.QueuedActionInput = {
      attire: EstforTypes.noAttire,
      actionId,
      combatStyle: EstforTypes.CombatStyle.NONE,
      choiceId: EstforConstants.NONE,
      choiceId1: EstforConstants.NONE,
      choiceId2: EstforConstants.NONE,
      regenerateId: EstforConstants.NONE,
      timespan: 500,
      rightHandEquipmentTokenId: EstforConstants.BRONZE_AXE,
      leftHandEquipmentTokenId: EstforConstants.NONE,
    };

    const rewards: EstforTypes.Equipment[] = [{itemTokenId: EstforConstants.BRONZE_BAR, amount: 3}];
    await expect(players.addXPThresholdRewards([{xpThreshold: 499, rewards}])).to.be.revertedWithCustomError(
      players,
      "XPThresholdNotFound"
    );
    await players.addXPThresholdRewards([{xpThreshold: 500, rewards}]);

    await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
    await ethers.provider.send("evm_increaseTime", [50]);
    await ethers.provider.send("evm_mine", []);

    let pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.produced.length).is.eq(1);
    await players.connect(alice).processActions(playerId);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.BRONZE_BAR)).to.eq(0);
    await ethers.provider.send("evm_increaseTime", [450]);
    await ethers.provider.send("evm_mine", []);
    pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.produced.length).is.eq(1);
    expect(pendingQueuedActionState.producedXPRewards.length).is.eq(1);
    expect(pendingQueuedActionState.producedXPRewards[0].itemTokenId).is.eq(EstforConstants.BRONZE_BAR);
    expect(pendingQueuedActionState.producedXPRewards[0].amount).is.eq(3);

    await players.connect(alice).processActions(playerId);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.BRONZE_BAR)).to.eq(3);
  });

  it("XP threshold rewards, multiple", async function () {
    const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_AXE,
      equipPosition: EstforTypes.EquipPosition.RIGHT_HAND,
    });

    const rate = 100 * 10; // per hour

    const tx = await world.addAction({
      actionId: 1,
      info: {
        skill: EstforTypes.Skill.WOODCUTTING,
        xpPerHour: 3600,
        minXP: 0,
        isDynamic: false,
        numSpawned: 0,
        handItemTokenIdRangeMin: EstforConstants.WOODCUTTING_BASE,
        handItemTokenIdRangeMax: EstforConstants.WOODCUTTING_MAX,
        isAvailable: actionIsAvailable,
        actionChoiceRequired: false,
        successPercent: 100,
      },
      guaranteedRewards: [{itemTokenId: EstforConstants.LOG, rate}],
      randomRewards: [],
      combatStats: EstforTypes.emptyCombatStats,
    });

    const actionId = await getActionId(tx);
    const queuedAction: EstforTypes.QueuedActionInput = {
      attire: EstforTypes.noAttire,
      actionId,
      combatStyle: EstforTypes.CombatStyle.NONE,
      choiceId: EstforConstants.NONE,
      choiceId1: EstforConstants.NONE,
      choiceId2: EstforConstants.NONE,
      regenerateId: EstforConstants.NONE,
      timespan: 1600,
      rightHandEquipmentTokenId: EstforConstants.BRONZE_AXE,
      leftHandEquipmentTokenId: EstforConstants.NONE,
    };

    const rewards: EstforTypes.Equipment[] = [{itemTokenId: EstforConstants.BRONZE_BAR, amount: 3}];
    await players.addXPThresholdRewards([{xpThreshold: 500, rewards}]);
    const rewards1: EstforTypes.Equipment[] = [{itemTokenId: EstforConstants.BRONZE_HELMET, amount: 4}];
    await players.addXPThresholdRewards([{xpThreshold: 1000, rewards: rewards1}]);

    await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
    await ethers.provider.send("evm_increaseTime", [1600]);
    await ethers.provider.send("evm_mine", []);

    let pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.producedXPRewards.length).is.eq(2);
    expect(pendingQueuedActionState.producedXPRewards[0].itemTokenId).is.eq(EstforConstants.BRONZE_BAR);
    expect(pendingQueuedActionState.producedXPRewards[0].amount).is.eq(3);
    expect(pendingQueuedActionState.producedXPRewards[1].itemTokenId).is.eq(EstforConstants.BRONZE_HELMET);
    expect(pendingQueuedActionState.producedXPRewards[1].amount).is.eq(4);

    await players.connect(alice).processActions(playerId);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.BRONZE_BAR)).to.eq(3);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.BRONZE_HELMET)).to.eq(4);
  });

  describe("Daily Rewards", function () {
    it("Daily & weekly reward on starting actions", async function () {
      const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

      players.setDailyRewardsEnabled(true);

      const {queuedAction} = await setupBasicWoodcutting(itemNFT, world);

      const oneDay = 24 * 3600;
      const oneWeek = oneDay * 7;
      const {timestamp: currentTimestamp} = await ethers.provider.getBlock("latest");
      const timestamp = Math.floor((currentTimestamp - 4 * oneDay) / oneWeek) * oneWeek + (oneWeek + 5 * oneDay); // Start next tuesday

      await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);

      let balanceBeforeWeeklyReward = await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST);

      const equipments = [
        {itemTokenId: EstforConstants.COPPER_ORE, amount: 100},
        {itemTokenId: EstforConstants.COAL_ORE, amount: 200},
        {itemTokenId: EstforConstants.RUBY, amount: 100},
        {itemTokenId: EstforConstants.MITHRIL_BAR, amount: 200},
        {itemTokenId: EstforConstants.COOKED_BOWFISH, amount: 100},
        {itemTokenId: EstforConstants.LEAF_FRAGMENTS, amount: 20},
        {itemTokenId: EstforConstants.HELL_SCROLL, amount: 300},
      ];

      let beforeBalances = await itemNFT.balanceOfs(
        alice.address,
        equipments.map((equipment) => equipment.itemTokenId)
      );

      for (let i = 0; i < 4; ++i) {
        await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
        await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      }
      await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);

      let afterBalances = await itemNFT.balanceOfs(
        alice.address,
        equipments.map((equipment) => equipment.itemTokenId)
      );

      for (let i = 1; i < 6; ++i) {
        expect(afterBalances[i]).to.eq(beforeBalances[i].toNumber() + equipments[i].amount);
      }

      expect(await players.dailyClaimedRewards(playerId)).to.eql([false, true, true, true, true, true, false]);

      // Last day of the week. This isn't a full week so shouldn't get weekly rewards, but still get daily rewards
      let balanceAfterWeeklyReward = await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST);
      expect(balanceBeforeWeeklyReward).to.eq(balanceAfterWeeklyReward);
      let prevBalanceDailyReward = await itemNFT.balanceOf(
        alice.address,
        equipments[equipments.length - 1].itemTokenId
      );
      await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
      expect(balanceAfterWeeklyReward).to.eq(await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST));
      let balanceAfterDailyReward = await itemNFT.balanceOf(
        alice.address,
        equipments[equipments.length - 1].itemTokenId
      );
      expect(balanceAfterDailyReward).to.eq(
        prevBalanceDailyReward.toNumber() + equipments[equipments.length - 1].amount
      );

      expect(await players.dailyClaimedRewards(playerId)).to.eql([false, true, true, true, true, true, true]);

      // Next one should start the next round
      await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      await ethers.provider.send("evm_mine", []);

      expect(await players.dailyClaimedRewards(playerId)).to.eql([false, false, false, false, false, false, false]);

      beforeBalances = await itemNFT.balanceOfs(
        alice.address,
        equipments.map((equipment) => equipment.itemTokenId)
      );

      for (let i = 0; i < 7; ++i) {
        await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
        if (i != 6) {
          await ethers.provider.send("evm_increaseTime", [3600 * 24]);
        }
      }

      expect(await players.dailyClaimedRewards(playerId)).to.eql([true, true, true, true, true, true, true]);

      afterBalances = await itemNFT.balanceOfs(
        alice.address,
        equipments.map((equipment) => equipment.itemTokenId)
      );

      for (let i = 0; i < 7; ++i) {
        expect(beforeBalances[i].toNumber() + equipments[i].amount).to.eq(afterBalances[i]);
      }

      // Also check extra week streak reward
      expect(balanceAfterWeeklyReward.toNumber() + 1).to.eq(
        await itemNFT.balanceOf(alice.address, EstforConstants.XP_BOOST)
      );
    });

    it("Only 1 claim", async function () {
      const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

      players.setDailyRewardsEnabled(true);

      const {queuedAction} = await setupBasicWoodcutting(itemNFT, world);

      const oneDay = 24 * 3600;
      const oneWeek = oneDay * 7;
      const {timestamp: currentTimestamp} = await ethers.provider.getBlock("latest");
      const timestamp = Math.floor((currentTimestamp - 4 * oneDay) / oneWeek) * oneWeek + (oneWeek + 4 * oneDay); // Start next monday

      await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);

      const equipment = {itemTokenId: EstforConstants.COPPER_ORE, amount: 100};
      let balanceBefore = await itemNFT.balanceOf(alice.address, equipment.itemTokenId);
      await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
      let balanceAfter = await itemNFT.balanceOf(alice.address, equipment.itemTokenId);
      expect(balanceAfter).to.eq(balanceBefore.toNumber() + equipment.amount);

      // Start again, shouldn't get any more rewards
      balanceBefore = await itemNFT.balanceOf(alice.address, equipment.itemTokenId);
      await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
      balanceAfter = await itemNFT.balanceOf(alice.address, equipment.itemTokenId);
      expect(balanceAfter).to.eq(balanceBefore);
    });

    it("Update on process actions", async function () {
      const {playerId, players, itemNFT, world, alice} = await loadFixture(playersFixture);

      players.setDailyRewardsEnabled(true);

      const {queuedAction} = await setupBasicWoodcutting(itemNFT, world);

      const oneDay = 24 * 3600;
      const oneWeek = oneDay * 7;
      const {timestamp: currentTimestamp} = await ethers.provider.getBlock("latest");
      const timestamp = Math.floor((currentTimestamp - 4 * oneDay) / oneWeek) * oneWeek + (oneWeek + 4 * oneDay); // Start next monday

      await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);

      await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
      expect(await players.dailyClaimedRewards(playerId)).to.eql([true, false, false, false, false, false, false]);
      await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      await players.connect(alice).processActions(playerId); // Daily reward should be given
      expect(await players.dailyClaimedRewards(playerId)).to.eql([true, true, false, false, false, false, false]);
    });

    it("Test rewards in new week", async function () {
      // TODO
    });
  });

  it("Guaranteed rewards", async function () {
    // TODO
  });

  it("Random reward ticket excess", async function () {
    const {playerId, players, itemNFT, world, alice, mockOracleClient} = await loadFixture(playersFixture);
    const MAX_UNIQUE_TICKETS = await players.MAX_UNIQUE_TICKETS();

    const monsterCombatStats: EstforTypes.CombatStats = {
      melee: 1,
      magic: 0,
      range: 0,
      meleeDefence: 0,
      magicDefence: 0,
      rangeDefence: 0,
      health: 1,
    };

    const randomChance = 65535; // 100%
    const numSpawned = 100;
    let tx = await world.addAction({
      actionId: 1,
      info: {
        skill: EstforTypes.Skill.COMBAT,
        xpPerHour: 3600,
        minXP: 0,
        isDynamic: false,
        numSpawned,
        handItemTokenIdRangeMin: EstforConstants.COMBAT_BASE,
        handItemTokenIdRangeMax: EstforConstants.COMBAT_MAX,
        isAvailable: actionIsAvailable,
        actionChoiceRequired: true,
        successPercent: 100,
      },
      guaranteedRewards: [],
      randomRewards: [{itemTokenId: EstforConstants.BRONZE_ARROW, chance: randomChance, amount: 1}],
      combatStats: monsterCombatStats,
    });
    const actionId = await getActionId(tx);

    tx = await world.addActionChoice(EstforConstants.NONE, 1, {
      ...emptyActionChoice,
      skill: EstforTypes.Skill.MELEE,
    });
    const choiceId = await getActionChoiceId(tx);
    await itemNFT.testMint(alice.address, EstforConstants.BRONZE_SWORD, 1);
    await itemNFT.testMint(alice.address, EstforConstants.BRONZE_HELMET, 1);

    await itemNFT.testMint(alice.address, EstforConstants.COOKED_MINNUS, 255);

    const numHours = 5;

    // Make sure it passes the next checkpoint so there are no issues running (TODO needed for this one?)
    const {timestamp} = await ethers.provider.getBlock("latest");
    const nextCheckpoint = Math.floor(timestamp / 86400) * 86400 + 86400;
    const durationToNextCheckpoint = nextCheckpoint - timestamp + 1;
    await ethers.provider.send("evm_increaseTime", [durationToNextCheckpoint]);

    tx = await world.requestRandomWords();
    let requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);
    tx = await world.requestRandomWords();
    requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);

    const timespan = 3600 * numHours;
    expect(numHours * numSpawned).to.be.greaterThan(MAX_UNIQUE_TICKETS);

    const queuedAction: EstforTypes.QueuedActionInput = {
      attire: {...EstforTypes.noAttire, head: EstforConstants.BRONZE_HELMET},
      actionId,
      combatStyle: EstforTypes.CombatStyle.ATTACK,
      choiceId,
      choiceId1: EstforConstants.NONE,
      choiceId2: EstforConstants.NONE,
      regenerateId: EstforConstants.COOKED_MINNUS,
      timespan,
      rightHandEquipmentTokenId: EstforConstants.BRONZE_SWORD,
      leftHandEquipmentTokenId: EstforConstants.NONE,
    };

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      combatStats: {
        ...EstforTypes.emptyCombatStats,
        melee: 50,
      },
      tokenId: EstforConstants.BRONZE_SWORD,
      equipPosition: EstforTypes.EquipPosition.RIGHT_HAND,
    });
    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      combatStats: bronzeHelmetStats,
      tokenId: EstforConstants.BRONZE_HELMET,
      equipPosition: EstforTypes.EquipPosition.HEAD,
    });

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_ARROW,
      equipPosition: EstforTypes.EquipPosition.ARROW_SATCHEL,
    });

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      healthRestored: 12,
      tokenId: EstforConstants.COOKED_MINNUS,
      equipPosition: EstforTypes.EquipPosition.FOOD,
    });

    await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);

    await ethers.provider.send("evm_increaseTime", [3600 * 24]);
    await ethers.provider.send("evm_mine", []);

    let pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.produced.length).to.eq(0);

    tx = await world.requestRandomWords();
    requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);

    pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.produced.length).to.eq(1);

    await players.connect(alice).processActions(playerId);

    // Check output
    expect(await itemNFT.balanceOf(alice.address, BRONZE_ARROW)).to.eq(numHours * numSpawned);
  });

  // This test only works if the timespan does not go over 00:00 utc
  it("Random rewards (many)", async function () {
    const {playerId, players, itemNFT, world, alice, mockOracleClient} = await loadFixture(playersFixture);

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_AXE,
      equipPosition: EstforTypes.EquipPosition.RIGHT_HAND,
    });

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_ARROW,
      equipPosition: EstforTypes.EquipPosition.ARROW_SATCHEL,
    });

    const randomChanceFraction = 50.0 / 100; // 50% chance
    const randomChance = Math.floor(65535 * randomChanceFraction);

    let tx = await world.addAction({
      actionId: 1,
      info: {
        skill: EstforTypes.Skill.WOODCUTTING,
        xpPerHour: 3600,
        minXP: 0,
        isDynamic: false,
        numSpawned: 0,
        handItemTokenIdRangeMin: EstforConstants.WOODCUTTING_BASE,
        handItemTokenIdRangeMax: EstforConstants.WOODCUTTING_MAX,
        isAvailable: actionIsAvailable,
        actionChoiceRequired: false,
        successPercent: 100,
      },
      guaranteedRewards: [],
      randomRewards: [{itemTokenId: EstforConstants.BRONZE_ARROW, chance: randomChance, amount: 1}],
      combatStats: EstforTypes.emptyCombatStats,
    });

    const actionId = await getActionId(tx);
    const numHours = 5;

    // Make sure it passes the next checkpoint so there are no issues running
    const {timestamp} = await ethers.provider.getBlock("latest");
    const nextCheckpoint = Math.floor(timestamp / 86400) * 86400 + 86400;
    const durationToNextCheckpoint = nextCheckpoint - timestamp + 1;
    await ethers.provider.send("evm_increaseTime", [durationToNextCheckpoint]);

    tx = await world.requestRandomWords();
    let requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);
    await ethers.provider.send("evm_increaseTime", [24 * 3600]);
    tx = await world.requestRandomWords();
    requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);

    const queuedAction: EstforTypes.QueuedActionInput = {
      attire: EstforTypes.noAttire,
      actionId,
      combatStyle: EstforTypes.CombatStyle.NONE,
      choiceId: EstforConstants.NONE,
      choiceId1: EstforConstants.NONE,
      choiceId2: EstforConstants.NONE,
      regenerateId: EstforConstants.NONE,
      timespan: 3600 * numHours,
      rightHandEquipmentTokenId: EstforConstants.BRONZE_AXE,
      leftHandEquipmentTokenId: EstforConstants.NONE,
    };

    let numProduced = 0;

    // Repeat the test a bunch of times to check the random rewards are as expected
    const numRepeats = 50;
    for (let i = 0; i < numRepeats; ++i) {
      await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
      let endTime;
      {
        const actionQueue = await players.getActionQueue(playerId);
        expect(actionQueue.length).to.eq(1);
        endTime = actionQueue[0].startTime + actionQueue[0].timespan;
      }

      expect(await world.hasRandomWord(endTime)).to.be.false;

      await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      await players.connect(alice).processActions(playerId);
      expect(await itemNFT.balanceOf(alice.address, EstforConstants.BRONZE_ARROW)).to.eq(numProduced);

      expect((await players.getPendingRandomRewards(playerId)).length).to.eq(1);

      let pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
      expect(pendingQueuedActionState.produced.length).to.eq(0);

      tx = await world.requestRandomWords();
      let requestId = getRequestId(tx);
      expect(requestId).to.not.eq(0);
      await mockOracleClient.fulfill(requestId, world.address);
      await ethers.provider.send("evm_increaseTime", [24 * 3600]);
      tx = await world.requestRandomWords();
      requestId = getRequestId(tx);
      expect(requestId).to.not.eq(0);
      await mockOracleClient.fulfill(requestId, world.address);

      expect(await world.hasRandomWord(endTime)).to.be.true;

      pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);

      if (pendingQueuedActionState.producedPastRandomRewards.length != 0) {
        expect(pendingQueuedActionState.producedPastRandomRewards.length).to.eq(1);

        const produced = pendingQueuedActionState.producedPastRandomRewards[0].amount;
        numProduced += produced;
        expect(pendingQueuedActionState.producedPastRandomRewards[0].itemTokenId).to.be.eq(
          EstforConstants.BRONZE_ARROW
        );
      }
    }
    const expectedTotal = numRepeats * randomChanceFraction * numHours;
    expect(numProduced).to.not.eq(expectedTotal); // Very unlikely to be exact, but possible. This checks there is at least some randomness
    expect(numProduced).to.be.gte(expectedTotal * 0.85); // Within 15% below
    expect(numProduced).to.be.lte(expectedTotal * 1.15); // 15% of the time we should get more than 50% of the reward
  });

  it("Multiple random rewards (many)", async function () {
    const {playerId, players, itemNFT, world, alice, mockOracleClient} = await loadFixture(playersFixture);

    this.timeout(100000); // 100 seconds, this test can take a while on CI

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_AXE,
      equipPosition: EstforTypes.EquipPosition.RIGHT_HAND,
    });

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_ARROW,
      equipPosition: EstforTypes.EquipPosition.ARROW_SATCHEL,
    });

    const randomChanceFractions = [80.0 / 100, 50.0 / 100, 50.0 / 100, 20.0 / 100]; // 80%, 50%, 50%, 20%
    const randomChance = Math.floor(65535 * randomChanceFractions[0]);
    const randomChance1 = Math.floor(65535 * randomChanceFractions[1]);
    const randomChance2 = Math.floor(65535 * randomChanceFractions[2]);
    const randomChance3 = Math.floor(65535 * randomChanceFractions[3]);

    let tx = await world.addAction({
      actionId: 1,
      info: {
        skill: EstforTypes.Skill.WOODCUTTING,
        xpPerHour: 3600,
        minXP: 0,
        isDynamic: false,
        numSpawned: 0,
        handItemTokenIdRangeMin: EstforConstants.WOODCUTTING_BASE,
        handItemTokenIdRangeMax: EstforConstants.WOODCUTTING_MAX,
        isAvailable: actionIsAvailable,
        actionChoiceRequired: false,
        successPercent: 100,
      },
      guaranteedRewards: [],
      randomRewards: [
        {itemTokenId: EstforConstants.BRONZE_BAR, chance: randomChance, amount: 1},
        {itemTokenId: EstforConstants.BRONZE_ARROW, chance: randomChance1, amount: 1},
        {itemTokenId: EstforConstants.BRONZE_TASSETS, chance: randomChance2, amount: 1},
        {itemTokenId: EstforConstants.BRONZE_GAUNTLETS, chance: randomChance3, amount: 1},
      ],
      combatStats: EstforTypes.emptyCombatStats,
    });

    const actionId = await getActionId(tx);
    const numHours = 2;

    // Make sure it passes the next checkpoint so there are no issues running
    const {timestamp} = await ethers.provider.getBlock("latest");
    const nextCheckpoint = Math.floor(timestamp / 86400) * 86400 + 86400;
    const durationToNextCheckpoint = nextCheckpoint - timestamp + 1;
    await ethers.provider.send("evm_increaseTime", [durationToNextCheckpoint]);

    tx = await world.requestRandomWords();
    let requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);
    tx = await world.requestRandomWords();
    requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);

    const queuedAction: EstforTypes.QueuedActionInput = {
      attire: EstforTypes.noAttire,
      actionId,
      combatStyle: EstforTypes.CombatStyle.NONE,
      choiceId: EstforConstants.NONE,
      choiceId1: EstforConstants.NONE,
      choiceId2: EstforConstants.NONE,
      regenerateId: EstforConstants.NONE,
      timespan: 3600 * numHours,
      rightHandEquipmentTokenId: EstforConstants.BRONZE_AXE,
      leftHandEquipmentTokenId: EstforConstants.NONE,
    };

    const balanceMap = new Map<number, number>();
    balanceMap.set(EstforConstants.BRONZE_BAR, 0);
    balanceMap.set(EstforConstants.BRONZE_ARROW, 0);
    balanceMap.set(EstforConstants.BRONZE_TASSETS, 0);
    balanceMap.set(EstforConstants.BRONZE_GAUNTLETS, 0);

    // Repeat the test a bunch of times to check the random rewards are as expected
    const numRepeats = 30;
    for (let i = 0; i < numRepeats; ++i) {
      await players
        .connect(alice)
        .startActions(playerId, [queuedAction, queuedAction], EstforTypes.ActionQueueStatus.KEEP_LAST_IN_PROGRESS);
      let endTime;
      {
        const actionQueue = await players.getActionQueue(playerId);
        expect(actionQueue.length).to.eq(2);
        endTime = actionQueue[1].startTime + actionQueue[1].timespan;
      }

      expect(await world.hasRandomWord(endTime)).to.be.false;

      await ethers.provider.send("evm_increaseTime", [3600 * 24]);
      await players.connect(alice).processActions(playerId);
      for (const [itemTokenId, amount] of balanceMap) {
        expect(await itemNFT.balanceOf(alice.address, itemTokenId)).to.eq(balanceMap.get(itemTokenId));
      }

      expect((await players.getPendingRandomRewards(playerId)).length).to.eq(2);

      let pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
      expect(pendingQueuedActionState.producedPastRandomRewards.length).to.eq(0);

      tx = await world.requestRandomWords();
      let requestId = getRequestId(tx);
      expect(requestId).to.not.eq(0);
      await mockOracleClient.fulfill(requestId, world.address);

      expect(await world.hasRandomWord(endTime)).to.be.true;

      pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
      if (pendingQueuedActionState.producedPastRandomRewards.length != 0) {
        expect(pendingQueuedActionState.producedPastRandomRewards.length).to.be.oneOf([1, 2, 3, 4, 5, 6, 7, 8]);

        for (const reward of pendingQueuedActionState.producedPastRandomRewards) {
          balanceMap.set(reward.itemTokenId, balanceMap.get(reward.itemTokenId)! + reward.amount);
        }
      }
    }

    let i = 0;
    for (const [itemTokenId, amount] of balanceMap) {
      const randomChanceFraction = randomChanceFractions[i];
      const expectedTotal = numRepeats * randomChanceFraction * numHours;
      // Have 2 queued actions so twice as much
      expect(balanceMap.get(itemTokenId)).to.not.eq(expectedTotal * 2); // Very unlikely to be exact, but possible. This checks there is at least some randomness
      expect(balanceMap.get(itemTokenId)).to.be.gte(expectedTotal * 0.75 * 2); // Within 25% below
      expect(balanceMap.get(itemTokenId)).to.be.lte(expectedTotal * 1.25 * 2); // Within 25% above
      ++i;
    }
  });

  // Could be a part of world if there was bytecode space
  it("Check random bytes", async function () {
    const {players, playerId, world, mockOracleClient} = await loadFixture(playersFixture);
    const {timestamp} = await ethers.provider.getBlock("latest");
    let numTickets = 16; // 240
    await expect(players.getRandomBytes(numTickets, timestamp - 86400, playerId)).to.be.reverted;
    const tx = await world.requestRandomWords();
    let requestId = getRequestId(tx);
    expect(requestId).to.not.eq(0);
    await mockOracleClient.fulfill(requestId, world.address);
    let randomBytes = await players.getRandomBytes(numTickets, timestamp - 86400, playerId);
    expect(ethers.utils.hexDataLength(randomBytes)).to.be.eq(32);
    numTickets = 48;

    const randomBytes1 = await players.getRandomBytes(numTickets, timestamp - 86400, playerId);
    expect(ethers.utils.hexDataLength(randomBytes1)).to.be.eq(32 * 3);

    numTickets = 49;
    const randomBytes2 = await players.getRandomBytes(numTickets, timestamp - 86400, playerId);
    expect(ethers.utils.hexDataLength(randomBytes2)).to.be.eq(32 * 3 * 5);
  });

  it("Rewards without XP", async function () {
    // Check that you can get guaranteed rewards even if you don't get XP (rewards rate >> XP rate)
    const {playerId, players, alice, world, itemNFT} = await loadFixture(playersFixture);

    const rate = 6500 * 10; // per hour
    const tx = await world.addAction({
      actionId: 1,
      info: {
        skill: EstforTypes.Skill.WOODCUTTING,
        xpPerHour: 0,
        minXP: 0,
        isDynamic: false,
        numSpawned: 0,
        handItemTokenIdRangeMin: EstforConstants.BRONZE_AXE,
        handItemTokenIdRangeMax: EstforConstants.WOODCUTTING_MAX,
        isAvailable: true,
        actionChoiceRequired: false,
        successPercent: 100,
      },
      guaranteedRewards: [{itemTokenId: EstforConstants.LOG, rate}],
      randomRewards: [],
      combatStats: EstforTypes.emptyCombatStats,
    });
    const actionId = getActionId(tx);

    const queuedAction: EstforTypes.QueuedActionInput = {
      attire: EstforTypes.noAttire,
      actionId,
      combatStyle: EstforTypes.CombatStyle.NONE,
      choiceId: EstforConstants.NONE,
      choiceId1: EstforConstants.NONE,
      choiceId2: EstforConstants.NONE,
      regenerateId: EstforConstants.NONE,
      timespan: 24 * 3600,
      rightHandEquipmentTokenId: EstforConstants.BRONZE_AXE,
      leftHandEquipmentTokenId: EstforConstants.NONE,
    };

    await itemNFT.addItem({
      ...EstforTypes.defaultInputItem,
      tokenId: EstforConstants.BRONZE_AXE,
      equipPosition: EstforTypes.EquipPosition.RIGHT_HAND,
    });

    await players.connect(alice).startAction(playerId, queuedAction, EstforTypes.ActionQueueStatus.NONE);
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.LOG)).to.eq(0);

    let pendingQueuedActionState = await players.pendingQueuedActionState(alice.address, playerId);
    expect(pendingQueuedActionState.produced.length).is.eq(1);
    expect(pendingQueuedActionState.produced[0].amount).to.gt(0);
    expect(pendingQueuedActionState.produced[0].itemTokenId).to.eq(EstforConstants.LOG);
    expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(0);
    await players.connect(alice).processActions(playerId);
    // Confirm 0 XP but got wood
    expect(await players.xp(playerId, EstforTypes.Skill.WOODCUTTING)).to.eq(0);
    expect(await itemNFT.balanceOf(alice.address, EstforConstants.LOG)).to.be.gt(0);
  });
});
