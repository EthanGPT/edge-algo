"""
Training script for KLBS Signal Filter RL agent.

Uses Ray RLlib for distributed training with PPO algorithm.
Supports walk-forward validation and hyperparameter optimization.
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional

import numpy as np
import pandas as pd

# Add parent directory for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from ml.environments import KLBSSignalFilterEnv
from ml.features import MockSentimentProvider
from ml.training.prepare_data import prepare_training_data


def create_env_config(
    signals_df: pd.DataFrame,
    ohlc_data: Dict[str, pd.DataFrame],
    sentiment_provider=None,
) -> Dict[str, Any]:
    """Create environment configuration for Ray."""
    return {
        "signals_df": signals_df,
        "ohlc_data": ohlc_data,
        "sentiment_provider": sentiment_provider or MockSentimentProvider(),
        "lookback_bars": 10,
        "reward_scheme": "asymmetric",
        "continuous_action": False,
        "normalize_pnl": True,
    }


def train_signal_filter(
    data_dir: str = "data",
    outputs_dir: str = "outputs",
    num_iterations: int = 100,
    checkpoint_freq: int = 10,
    use_ray: bool = True,
) -> Dict[str, Any]:
    """
    Train the signal filter agent.

    Args:
        data_dir: Directory with OHLC data
        outputs_dir: Directory with trade outputs
        num_iterations: Number of training iterations
        checkpoint_freq: Save checkpoint every N iterations
        use_ray: Whether to use Ray RLlib (requires installation)

    Returns:
        Training results dict
    """
    print("=" * 60)
    print("KLBS Signal Filter Training")
    print("=" * 60)

    # Prepare data
    print("\n1. Loading data...")
    data = prepare_training_data(data_dir, outputs_dir)

    train_signals = data["train_signals"]
    val_signals = data["val_signals"]
    ohlc_data = data["ohlc_data"]

    print(f"\nTraining on {len(train_signals):,} signals")
    print(f"Validating on {len(val_signals):,} signals")

    # Create sentiment provider
    sentiment_provider = MockSentimentProvider()

    if use_ray:
        return _train_with_ray(
            train_signals,
            val_signals,
            ohlc_data,
            sentiment_provider,
            num_iterations,
            checkpoint_freq,
        )
    else:
        return _train_simple(
            train_signals,
            val_signals,
            ohlc_data,
            sentiment_provider,
            num_iterations,
        )


def _train_with_ray(
    train_signals: pd.DataFrame,
    val_signals: pd.DataFrame,
    ohlc_data: Dict[str, pd.DataFrame],
    sentiment_provider,
    num_iterations: int,
    checkpoint_freq: int,
) -> Dict[str, Any]:
    """Train using Ray RLlib."""
    try:
        import ray
        from ray import tune
        from ray.rllib.algorithms.ppo import PPOConfig
    except ImportError:
        print("Ray RLlib not installed. Install with:")
        print("  pip install ray[rllib]")
        print("\nFalling back to simple training...")
        return _train_simple(
            train_signals, val_signals, ohlc_data, sentiment_provider, num_iterations
        )

    print("\n2. Initializing Ray...")
    ray.init(ignore_reinit_error=True)

    # Create environment registration
    def env_creator(env_config):
        return KLBSSignalFilterEnv(**env_config)

    from ray.tune.registry import register_env

    register_env("KLBSSignalFilter", env_creator)

    # Training environment config
    train_env_config = create_env_config(train_signals, ohlc_data, sentiment_provider)

    # PPO configuration
    print("\n3. Configuring PPO agent...")
    config = (
        PPOConfig()
        .environment(
            env="KLBSSignalFilter",
            env_config=train_env_config,
        )
        .framework("torch")
        .training(
            lr=3e-4,
            gamma=0.99,
            lambda_=0.95,
            clip_param=0.2,
            entropy_coeff=0.01,
            vf_loss_coeff=0.5,
            train_batch_size=2048,
            sgd_minibatch_size=256,
            num_sgd_iter=10,
            model={
                "fcnet_hiddens": [128, 128, 64],
                "fcnet_activation": "relu",
            },
        )
        .rollouts(
            num_rollout_workers=2,
            rollout_fragment_length=200,
        )
        .evaluation(
            evaluation_interval=10,
            evaluation_duration=10,
            evaluation_config={
                "env_config": create_env_config(
                    val_signals, ohlc_data, sentiment_provider
                )
            },
        )
    )

    # Build algorithm
    print("\n4. Building algorithm...")
    algo = config.build()

    # Training loop
    print("\n5. Starting training...")
    results = []
    best_reward = float("-inf")
    checkpoint_dir = Path("checkpoints") / datetime.now().strftime("%Y%m%d_%H%M%S")
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    for i in range(num_iterations):
        result = algo.train()
        results.append(result)

        # Log progress
        reward = result["episode_reward_mean"]
        if i % 5 == 0:
            print(
                f"Iteration {i+1}/{num_iterations} | "
                f"Reward: {reward:.3f} | "
                f"Episodes: {result.get('episodes_total', 0)}"
            )

        # Save best checkpoint
        if reward > best_reward:
            best_reward = reward
            algo.save(str(checkpoint_dir / "best"))
            print(f"  -> New best reward: {best_reward:.3f}")

        # Regular checkpoints
        if (i + 1) % checkpoint_freq == 0:
            algo.save(str(checkpoint_dir / f"iter_{i+1}"))

    # Final save
    final_path = algo.save(str(checkpoint_dir / "final"))
    print(f"\n6. Training complete!")
    print(f"   Final checkpoint: {final_path}")
    print(f"   Best reward: {best_reward:.3f}")

    # Cleanup
    algo.stop()
    ray.shutdown()

    return {
        "results": results,
        "best_reward": best_reward,
        "checkpoint_dir": str(checkpoint_dir),
    }


def _train_simple(
    train_signals: pd.DataFrame,
    val_signals: pd.DataFrame,
    ohlc_data: Dict[str, pd.DataFrame],
    sentiment_provider,
    num_iterations: int,
) -> Dict[str, Any]:
    """
    Simple training loop without Ray for testing.

    Uses a basic random policy to demonstrate the environment.
    For real training, use Ray RLlib or implement custom training.
    """
    print("\n2. Running simple training (no Ray)...")

    # Create environment
    env_config = create_env_config(train_signals, ohlc_data, sentiment_provider)
    env = KLBSSignalFilterEnv(**env_config)

    # Simple evaluation: random baseline
    print("\n3. Evaluating random baseline...")

    total_rewards = []
    actions_taken = {"take": 0, "skip": 0}
    outcomes = {"WIN": 0, "LOSS": 0, "BE": 0}

    for episode in range(min(num_iterations, 10)):
        obs, info = env.reset()
        episode_reward = 0
        done = False

        while not done:
            # Random action
            action = env.action_space.sample()
            obs, reward, terminated, truncated, info = env.step(action)
            done = terminated or truncated

            episode_reward += reward

            if "action_taken" in info:
                if info["action_taken"]:
                    actions_taken["take"] += 1
                    outcomes[info["signal"]["outcome"]] += 1
                else:
                    actions_taken["skip"] += 1

        total_rewards.append(episode_reward)
        print(f"Episode {episode + 1}: Reward = {episode_reward:.2f}")

    # Summary stats
    print("\n4. Training Summary (Random Baseline):")
    print(f"   Average reward: {np.mean(total_rewards):.3f}")
    print(f"   Actions: Take={actions_taken['take']}, Skip={actions_taken['skip']}")
    print(f"   Outcomes when taken: {outcomes}")

    # Calculate baseline metrics
    take_rate = actions_taken["take"] / max(1, sum(actions_taken.values()))
    win_rate = outcomes["WIN"] / max(1, sum(outcomes.values()))

    print(f"\n   Take rate: {take_rate:.1%}")
    print(f"   Win rate (when taken): {win_rate:.1%}")

    print("\n5. For full training, install Ray RLlib:")
    print("   pip install ray[rllib] torch")

    return {
        "results": total_rewards,
        "best_reward": max(total_rewards) if total_rewards else 0,
        "baseline_take_rate": take_rate,
        "baseline_win_rate": win_rate,
    }


def evaluate_model(
    checkpoint_path: str,
    test_signals: pd.DataFrame,
    ohlc_data: Dict[str, pd.DataFrame],
) -> Dict[str, Any]:
    """
    Evaluate a trained model on test data.

    Args:
        checkpoint_path: Path to saved model checkpoint
        test_signals: Test signals DataFrame
        ohlc_data: OHLC data dict

    Returns:
        Evaluation metrics
    """
    try:
        import ray
        from ray.rllib.algorithms.ppo import PPO
    except ImportError:
        print("Ray RLlib required for evaluation")
        return {}

    ray.init(ignore_reinit_error=True)

    # Load model
    algo = PPO.from_checkpoint(checkpoint_path)

    # Create test environment
    env_config = create_env_config(test_signals, ohlc_data, MockSentimentProvider())
    env = KLBSSignalFilterEnv(**env_config)

    # Evaluate
    obs, info = env.reset()
    done = False
    total_reward = 0
    actions = []
    signals_taken = []

    while not done:
        action = algo.compute_single_action(obs)
        obs, reward, terminated, truncated, info = env.step(action)
        done = terminated or truncated

        total_reward += reward
        actions.append(action)
        if info.get("action_taken"):
            signals_taken.append(info["signal"])

    # Calculate metrics
    n_taken = sum(actions)
    n_skipped = len(actions) - n_taken
    wins = sum(1 for s in signals_taken if s["outcome"] == "WIN")
    losses = sum(1 for s in signals_taken if s["outcome"] == "LOSS")

    metrics = {
        "total_reward": total_reward,
        "signals_taken": n_taken,
        "signals_skipped": n_skipped,
        "take_rate": n_taken / len(actions) if actions else 0,
        "filtered_win_rate": wins / n_taken if n_taken > 0 else 0,
        "filtered_pnl": sum(s["pnl_usd"] for s in signals_taken),
        "original_pnl": test_signals["pnl_usd"].sum(),
    }

    print("\nEvaluation Results:")
    print(f"  Total reward: {metrics['total_reward']:.2f}")
    print(f"  Signals taken: {n_taken}/{len(actions)} ({metrics['take_rate']:.1%})")
    print(f"  Filtered win rate: {metrics['filtered_win_rate']:.1%}")
    print(f"  Filtered PnL: ${metrics['filtered_pnl']:,.2f}")
    print(f"  Original PnL: ${metrics['original_pnl']:,.2f}")
    print(
        f"  Improvement: ${metrics['filtered_pnl'] - metrics['original_pnl']:,.2f}"
    )

    ray.shutdown()
    return metrics


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train KLBS Signal Filter")
    parser.add_argument("--data-dir", default="data", help="OHLC data directory")
    parser.add_argument("--outputs-dir", default="outputs", help="Trade outputs directory")
    parser.add_argument("--iterations", type=int, default=100, help="Training iterations")
    parser.add_argument("--no-ray", action="store_true", help="Disable Ray RLlib")
    args = parser.parse_args()

    # Change to klbs-backtest directory
    script_dir = Path(__file__).parent.parent.parent
    os.chdir(script_dir)

    train_signal_filter(
        data_dir=args.data_dir,
        outputs_dir=args.outputs_dir,
        num_iterations=args.iterations,
        use_ray=not args.no_ray,
    )
