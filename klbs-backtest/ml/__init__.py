"""
KLBS Signal Filter - ML/RL Module

Reinforcement learning system for filtering KLBS trading signals.
Uses market context, time features, and sentiment analysis to
score signals and improve trade selection.

Usage:
    # Training
    from ml.training import train_signal_filter
    train_signal_filter(data_dir="data", outputs_dir="outputs")

    # Inference
    from ml.inference import run_server
    run_server(model_path="checkpoints/best", port=8000)
"""

__version__ = "0.1.0"
